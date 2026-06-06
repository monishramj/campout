import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

import socket_client

CLIENT_DIR = os.path.join(os.path.dirname(__file__), "..", "client")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await socket_client.connect()
    yield
    await socket_client.close()


app = FastAPI(lifespan=lifespan)


@app.post("/guest")
async def guest():
    sess_id = uuid.uuid4().hex
    await socket_client.send({"type": "add_player", "sess_id": sess_id})
    return {"sess_id": sess_id}


@app.get("/state")
async def state():
    return await socket_client.request({"type": "get_state"})


@app.get("/map")
async def game_map():
    return await socket_client.request({"type": "get_map"})


@app.post("/input")
async def input(body: dict):
    await socket_client.send(body)
    return {"inputted": True}


@app.post("/register")
async def register():
    return {"message": "not implemented"}


@app.post("/login")
async def login():
    return {"message": "not implemented"}


@app.get("/leaderboard")
async def leaderboard():
    return {"leaderboard": []}


app.mount("/", StaticFiles(directory=CLIENT_DIR, html=True), name="client")
