import asyncio
import json
from typing import Optional

SOCKET_PATH = "/tmp/campout.sock"

_reader: Optional[asyncio.StreamReader] = None
_writer: Optional[asyncio.StreamWriter] = None

async def connect():
    global _reader, _writer
    _reader, _writer = await asyncio.open_unix_connection( SOCKET_PATH)
    
async def send(msg: dict):
    if _writer is None:
        raise RuntimeError("writer uninitialized")

    j = json.dumps(msg) + '\n'
    _writer.write(j.encode())
    await _writer.drain()
    return

async def receive() -> dict:
    if _reader is None:
        raise RuntimeError("reader uninitialized")
    input = await _reader.readline()
    msg = json.loads(input.decode())
    
    return msg

async def close():
    if _writer is None:
        return
    _writer.close()
    await _writer.wait_closed()