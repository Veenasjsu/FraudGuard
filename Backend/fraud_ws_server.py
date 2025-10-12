from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import asyncio
import json

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

active_connections: List[WebSocket] = []

@app.get("/")
def root():
    return {"message": "WebSocket server running. Connect at /ws/alerts"}

@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except:
        active_connections.remove(websocket)

async def broadcast_alert(alert: dict):
    for conn in active_connections:
        await conn.send_json(alert)

@app.post("/_test_send")
async def _test_send():
    # minimal payload; your UI will show it immediately
    await broadcast_alert({"user": "1234", "amount": 42.0, "fraud": 1})
    return {"ok": True}
