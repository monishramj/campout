import asyncio
import json
import random
import uuid
from typing import Optional, Callable

SOCKET_PATH = "/tmp/campout.sock"
REQUEST_TIMEOUT = 5.0
INITIAL_BACKOFF = 0.5  # seconds, first retry delay
MAX_BACKOFF = 10.0  # seconds, cap on retry delay
BACKOFF_JITTER = 0.2  # +/- fraction of the delay, avoids thundering-herd retries

_reader: Optional[asyncio.StreamReader] = None
_writer: Optional[asyncio.StreamWriter] = None
_write_lock = asyncio.Lock()
_pending: dict[str, asyncio.Future] = {}
_snapshot_handler: Optional[Callable[[dict], None]] = None
_connected = asyncio.Event()


def set_snapshot_handler(handler: Callable[[dict], None]) -> None:
    global _snapshot_handler
    _snapshot_handler = handler


async def connect():
    global _reader, _writer
    _reader, _writer = await asyncio.open_unix_connection(SOCKET_PATH)
    _connected.set()
    asyncio.create_task(_supervisor())


async def _supervisor() -> None:
    while (1):
        await _reader_loop()
        await _reconnect_with_backoff()


async def _reconnect_with_backoff() -> None:
    global _reader, _writer
    delay = INITIAL_BACKOFF
    while True:
        try:
            _reader, _writer = await asyncio.open_unix_connection(SOCKET_PATH)
            _connected.set()
            print("socket_client: reconnected to C++")
            return
        except (ConnectionRefusedError, FileNotFoundError, OSError) as e:
            jitter = delay * BACKOFF_JITTER
            wait = max(delay + random.uniform(-jitter, jitter), 0)
            print(f"socket_client: reconnect failed ({type(e).__name__}), retrying in {wait:.1f}s")
            await asyncio.sleep(wait)
            delay = min(delay * 2, MAX_BACKOFF)


async def _reader_loop():
    if _reader is None:
        raise RuntimeError("reader uninit")
    if _snapshot_handler is None:
        raise RuntimeError("snapshot_handler uninit")

    while True:
        line = await _reader.readline()
        if (line == b''):
            _connected.clear()
            for future in _pending.values():
                if not future.done():
                    future.set_exception(ConnectionError("socket EOF"))
            _pending.clear()
            break

        try:
            msg = json.loads(line.decode())
        except Exception as e:
            print(f"socket_client: malformed line, dropping: {line!r} ({e})")
            continue

        req_id = msg.get("req_id")
        if (msg.get("type") == "snapshot"):
            _snapshot_handler(msg)
        elif (req_id is not None and req_id in _pending):
            future = _pending.pop(req_id)
            if not future.done():
                future.set_result(msg)
        else:
            print(f"socket_client: unrouted message, dropping: {msg!r}")


async def _write(msg: dict):
    if _writer is None:
        raise RuntimeError("writer uninitialized")
    _writer.write((json.dumps(msg) + "\n").encode())
    await _writer.drain()


async def send(msg: dict):
    # no reply expected
    if not _connected.is_set():
        raise ConnectionError("not connected to C++")
    async with _write_lock:
        await _write(msg)


async def request(msg: dict) -> dict:
    if not _connected.is_set():
        raise ConnectionError("not connected to C++")
    req_id = uuid.uuid4().hex
    msg["req_id"] = req_id
    future = asyncio.get_running_loop().create_future()
    _pending[req_id] = future

    try:
        async with _write_lock:
            await _write(msg)
        return await asyncio.wait_for(future, REQUEST_TIMEOUT)
    finally:
        _pending.pop(req_id, None)


async def close():
    if _writer is None:
        return
    _writer.close()
    await _writer.wait_closed()
