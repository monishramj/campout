from fastapi import FastAPI
from contextlib import asynccontextmanager
import socket_client

@asynccontextmanager
async def lifespan(app: FastAPI):
    await socket_client.connect()
    yield
    await socket_client.close()
    return

app = FastAPI(lifespan=lifespan)

@app.post("/guest")
async def guest():
    # TODO(human): send add_player to C++, return sess_id
    await socket_client.send({"type" : "add_player"})
    return {"sess_id": "guest"}

@app.get("/state")
async def state():
    await socket_client.send({"type": "get_state"})
    result = await socket_client.receive()
    return result

@app.post("/input")
async def input(body: dict):
    await socket_client.send(body)
    return {"inputted" : True}

@app.post("/register")
async def register():
    return {"message": "not implemented"}


@app.post("/login")
async def login():
    return {"message": "not implemented"}

@app.get("/leaderboard")
async def leaderboard():
    return {"leaderboard": []}