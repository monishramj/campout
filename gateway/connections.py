from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Optional

from fastapi import WebSocket


@dataclass
class ClientConn:
    sess_id: str
    ws: WebSocket
    # maxsize=1: at most one pending snapshot per client (roadmap invariant #3).
    # Step 3 fills this; Step 4's fan-out writes into it with replace-not-append.
    outbound: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=1))
    # set once Step 3's sender task exists; None until then.
    sender_task: Optional[asyncio.Task] = None


# sess_id
connections: dict[str, ClientConn] = {}


async def register(sess_id: str, ws: WebSocket) -> ClientConn:

    conn = ClientConn(sess_id, ws)

    if (sess_id in connections) :
        old = connections.get(sess_id)
        if old:
            if old.sender_task is not None:
                old.sender_task.cancel()
            try:
                await old.ws.send_json({"type": "kicked", "reason": "new connection"})  
                await old.ws.close()
            except Exception as e:
                print(f"erorr when closing old ws connection: {type(e).__name__}")
                

    connections[sess_id] = conn
    return conn


def unregister(sess_id: str) -> Optional[ClientConn]:
    return connections.pop(sess_id, None)


async def sender_loop(conn: ClientConn) -> None:

    while (1) :
        try:
            item = await conn.outbound.get()
            await conn.ws.send_json(item)
        except Exception as e:
            print(f"sender_loop error: {type(e).__name__}")
            return
    
