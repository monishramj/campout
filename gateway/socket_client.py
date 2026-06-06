import asyncio
import json
from typing import Optional

SOCKET_PATH = "/tmp/campout.sock"

_reader: Optional[asyncio.StreamReader] = None
_writer: Optional[asyncio.StreamWriter] = None

_lock = asyncio.Lock()


async def connect():
    global _reader, _writer
    _reader, _writer = await asyncio.open_unix_connection(SOCKET_PATH)


async def _write(msg: dict):
    if _writer is None:
        raise RuntimeError("writer uninitialized")
    j = json.dumps(msg) + '\n'
    _writer.write(j.encode())
    await _writer.drain()


async def _read() -> dict:
    if _reader is None:
        raise RuntimeError("reader uninitialized")
    line = await _reader.readline()
    return json.loads(line.decode())


async def send(msg: dict):
    async with _lock:
        await _write(msg)


async def request(msg: dict) -> dict:
    async with _lock:
        await _write(msg)
        return await _read()


async def close():
    if _writer is None:
        return
    _writer.close()
    await _writer.wait_closed()
