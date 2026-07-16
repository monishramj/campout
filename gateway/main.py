import asyncio
import os
import uuid
from contextlib import asynccontextmanager

import bcrypt
import connections
import db
import socket_client
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import exc, text

# migrate constants to its own file later
CLIENT_DIR = os.path.join(os.path.dirname(__file__), "..", "client")

ALLOWED_INPUT_TYPES = {"move_player", "action"}
AUTH_TIMEOUT = 15.0


class UserInfoItem(BaseModel):
    username: str
    password: str


def broadcast_snapshot(msg: dict) -> None:
    for conn in connections.connections.values():
        try:
            conn.outbound.get_nowait()
        except asyncio.QueueEmpty:
            pass
        except Exception as e:
            print(f"broadcast_snap error: {type(e).__name__}")
        conn.outbound.put_nowait(msg)


@asynccontextmanager
async def lifespan(app: FastAPI):
    socket_client.set_snapshot_handler(broadcast_snapshot)
    await socket_client.connect()
    asyncio.create_task(death_updates())
    yield
    await socket_client.close()


app = FastAPI(lifespan=lifespan)


@app.exception_handler(ConnectionError)
async def connection_error_handler(request: Request, exc: ConnectionError):
    return JSONResponse(status_code=503, content={"detail": "game server unavailable, try again shortly"})


@app.post("/guest")
async def guest():

    guest_username = f"Camper_{uuid.uuid4().hex[:8]}"
    async with db.engine.begin() as conn:
        p_id = await conn.execute(
            text("""
                INSERT INTO players (is_guest, username)
                VALUES (true, :guest_username) RETURNING id
            """).bindparams(guest_username=guest_username)
        )
        s_id = await conn.execute(
            text(
                """
                INSERT INTO sessions (player_id) VALUES (:p_id) RETURNING token_id
            """
            ).bindparams(p_id=p_id.scalar())
        )
        s_id = str(s_id.scalar())

    return {"sess_id": s_id}


# token_id matches with token_id in get call above
@app.get("/session/{token_id}/stats")
async def session_stats(token_id: str):
    async with db.engine.begin() as conn:
        result = await conn.execute(
            text(
                """
                SELECT days_survived, kills FROM sessions WHERE token_id = CAST(:token_id AS uuid)
            """
            ).bindparams(token_id=token_id)
        )
        session = result.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return dict(session._mapping)


# here for degugging purposes, can be removed later ig
@app.get("/deaths")
async def deaths():
    return await socket_client.request({"type": "get_deaths"})


@app.get("/map")
async def game_map():
    return await socket_client.request({"type": "get_map"})


@app.post("/register")
async def register(item: UserInfoItem):
    salt = bcrypt.gensalt()

    username = item.username
    password = bcrypt.hashpw(item.password.encode("utf-8"), salt)
    try:
        async with db.engine.begin() as conn:
            p_id = await conn.execute(
                text("""
                    INSERT INTO players (username, password_hash)
                    VALUES (:username, :password) RETURNING id
                """).bindparams(username=username, password=password.decode("utf-8"))
            )
            s_id = await conn.execute(
                text(
                    """
                    INSERT INTO sessions (player_id)
                    VALUES (:p_id) RETURNING token_id
                """
                ).bindparams(p_id=p_id.scalar())
            )
            s_id = str(s_id.scalar())

            return {"sess_id": s_id}
    except exc.IntegrityError:
        raise HTTPException(status_code=400, detail="Username already exists")


@app.post("/login")
async def login(item: UserInfoItem):
    username = item.username
    password = item.password.encode("utf-8")
    async with db.engine.begin() as conn:
        result = await conn.execute(
            text("""
                SELECT id, password_hash FROM players
                WHERE username = :username
            """).bindparams(username=username)
        )
        player = result.fetchone()
        if not player or not bcrypt.checkpw(
            password, player.password_hash.encode("utf-8")
        ):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        p_id = player.id
        s_id = await conn.execute(
            text(
                """
                INSERT INTO sessions (player_id) VALUES (:p_id) RETURNING token_id
            """
            ).bindparams(p_id=p_id)
        )
        s_id = str(s_id.scalar())

    return {"sess_id": s_id}


async def receive_loop(ws: WebSocket, sess_id: str) -> None:
    while True:
        msg = await ws.receive_json()
        if not isinstance(msg, dict) or msg.get("type") not in ALLOWED_INPUT_TYPES:
            continue
        msg["sess_id"] = sess_id
        await socket_client.send(msg)


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    # btw this code sucks, fix allt he returns and ws.closes, there must be a better way to do this
    try:

        hs = await asyncio.wait_for(ws.receive_json(), timeout=AUTH_TIMEOUT)
        if (hs["type"] == "authenticate"):
            token_id = hs["token"]
            async with db.engine.begin() as conn:
                result = await conn.execute(
                    text(
                        """
                        SELECT is_active FROM sessions WHERE token_id = CAST(:token_id AS uuid)
                    """
                    ).bindparams(token_id=token_id)
                )
                session = result.fetchone()
                if not session:
                    await ws.send_json({"type": "auth_fail", "reason": "session not found"})
                    await ws.close()
                    return
            session = dict(session._mapping)
            if not session["is_active"]:
                await ws.send_json({"type": "auth_fail", "reason": "inactive session"})
                await ws.close()
                return

            response = await socket_client.request({"type": "add_player", "sess_id": token_id})
            if not response["success"]:
                await ws.send_json({"type": "auth_fail", "reason": "full session"})
                await ws.close()
                return
            conn = await connections.register(token_id, ws)
            conn.sender_task = asyncio.create_task(connections.sender_loop(conn))

            recv_task = asyncio.create_task(receive_loop(ws, token_id))
            done, pending = await asyncio.wait({conn.sender_task, recv_task}, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)
            if connections.connections.get(token_id) is conn:
                connections.unregister(token_id)
                await socket_client.send({"type": "remove_player", "sess_id": token_id})
            try:  # so we don't try and close an already closed connection
                await ws.close()
            except Exception:
                pass
            return

        else:
            await ws.send_json({"type": "auth_fail", "reason": "not auth msg type"})
            await ws.close()
            return
    except asyncio.TimeoutError:
        await ws.send_json({"type": "auth_fail", "reason": "timeout error"})
        print("ws_endpoint error: timeouterror")
        await ws.close()
        return
    except WebSocketDisconnect:
        print("ws_endpoint error: client closed mid handshake - websocket disconnect")
        return
    except Exception as e:
        print(f"ws_endpoint error: {type(e).__name__}")
        await ws.send_json({"type": "auth_fail", "reason": f"{type(e).__name__}"})
        await ws.close()
        return


@app.get("/leaderboard")
async def leaderboard():
    async with db.engine.begin() as conn:
        top_board = await conn.execute(
            text("""
                    SELECT player_id, username, best_days_survived, total_kills
                    FROM leaderboard
                    LIMIT 25
                """)
        )
    rows = top_board.mappings().all()
    return {"leaderboard": rows}


async def death_updates():
    while True:
        try:
            deaths = await socket_client.request({"type": "get_deaths"})
            async with db.engine.begin() as conn:
                for death in deaths["deaths"]:
                    await conn.execute(
                        text(
                            """
                                UPDATE sessions
                                SET is_active = false,
                                    days_survived = :days_survived,
                                    kills = :kills,
                                    ended_at = now()
                                WHERE token_id = CAST(:session_id AS uuid)
                            """
                        ).bindparams(
                            session_id=death["sess_id"],
                            days_survived=death["days_survived"],
                            kills=death["kills"],
                        )
                    )
                if deaths["deaths"]:
                    await conn.execute(
                        text(
                            """
                            REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard
                            """
                        )
                    )

            if deaths["deaths"]:
                max_id = max(death["id"] for death in deaths["deaths"])
                await socket_client.send({"type": "death_ack", "acked_id": max_id})
        except Exception as e:
            print(f"Error in death_updates: {e}")

        await asyncio.sleep(5)


app.mount("/", StaticFiles(directory=CLIENT_DIR, html=True), name="client")
