import asyncio
import os
import uuid
from contextlib import asynccontextmanager

import bcrypt
import db
import socket_client
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import exc, text

CLIENT_DIR = os.path.join(os.path.dirname(__file__), "..", "client")


class UserInfoItem(BaseModel):
    username: str
    password: str


@asynccontextmanager
async def lifespan(app: FastAPI):

    await socket_client.connect()
    asyncio.create_task(death_updates())
    yield
    await socket_client.close()


app = FastAPI(lifespan=lifespan)


@app.post("/guest")
async def guest():

    guest_username = f"Camper_{uuid.uuid4().hex[:8]}"
    async with db.engine.begin() as conn:
        p_id = await conn.execute(
            text("""
                INSERT INTO players (is_guest, username) VALUES (true, :guest_username) RETURNING id
            """).bindparams(guest_username=guest_username)
        )
        s_id = await conn.execute(
            text(
                """
                INSERT INTO sessions (player_id) VALUES (:p_id) RETURNING id
            """
            ).bindparams(p_id=p_id.scalar())
        )
        s_id = str(s_id.scalar())

    await socket_client.send({"type": "add_player", "sess_id": s_id})
    return {"sess_id": s_id}


@app.get("/state")
async def state():
    return await socket_client.request({"type": "get_state"})


# here for degugging purposes, can be removed later ig
@app.get("/deaths")
async def deaths():
    return await socket_client.request({"type": "get_deaths"})


@app.get("/map")
async def game_map():
    return await socket_client.request({"type": "get_map"})


@app.post("/input")
async def input(body: dict):
    await socket_client.send(body)
    return {"inputted": True}


@app.post("/register")
async def register(item: UserInfoItem):
    salt = bcrypt.gensalt()

    username = item.username
    password = bcrypt.hashpw(item.password.encode("utf-8"), salt)
    try:
        async with db.engine.begin() as conn:
            p_id = await conn.execute(
                text("""
                    INSERT INTO players (username, password_hash) VALUES (:username, :password) RETURNING id
                """).bindparams(username=username, password=password.decode("utf-8"))
            )
            s_id = await conn.execute(
                text(
                    """
                    INSERT INTO sessions (player_id) VALUES (:p_id) RETURNING id
                """
                ).bindparams(p_id=p_id.scalar())
            )
            s_id = str(s_id.scalar())

            await socket_client.send({"type": "add_player", "sess_id": s_id})
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
                SELECT id, password_hash FROM players WHERE username = :username
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
                INSERT INTO sessions (player_id) VALUES (:p_id) RETURNING id
            """
            ).bindparams(p_id=p_id)
        )
        s_id = str(s_id.scalar())

    await socket_client.send({"type": "add_player", "sess_id": s_id})
    return {"sess_id": s_id}


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
    try:
        while True:
            deaths = await socket_client.request({"type": "get_deaths"})
            async with db.engine.begin() as conn:
                for death in deaths["deaths"]:
                    await conn.execute(
                        text(
                            """
                                UPDATE sessions SET is_active = false, days_survived = :days_survived, kills = :kills, ended_at = now()
                                WHERE id = :session_id
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

            await asyncio.sleep(5)
    except Exception as e:
        print(f"Error in death_updates: {e}")


app.mount("/", StaticFiles(directory=CLIENT_DIR, html=True), name="client")
