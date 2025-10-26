# fraud_ws_server.py
from fastapi import FastAPI, WebSocket, Body
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketDisconnect, WebSocketState
from typing import List, Dict, Any
import asyncio

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

active_connections: List[WebSocket] = []

# ⬇️ ADD THIS: in-memory ring buffer for recent transactions
transactions: List[Dict[str, Any]] = []
MAX_TX = 5000

@app.get("/")
def root():
    return {"message": "WebSocket server running. Connect at /ws/alerts"}

@app.get("/health")
def health():
    return {"ok": True, "connections": len(active_connections), "stored": len(transactions)}

async def _heartbeat(ws: WebSocket, interval: float = 25.0):
    try:
        while True:
            await asyncio.sleep(interval)
            if ws.application_state != WebSocketState.CONNECTED:
                break
            await ws.send_json({"type": "ping"})
    except Exception:
        pass

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        await websocket.send_json({"type": "hello", "message": "connected to /ws/alerts"})
    except Exception:
        try:
            await websocket.close()
        finally:
            if websocket in active_connections:
                active_connections.remove(websocket)
        return

    ping_task = asyncio.create_task(_heartbeat(websocket, interval=25.0))
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        ping_task.cancel()
        try: await ping_task
        except Exception: pass
        if websocket in active_connections:
            active_connections.remove(websocket)

async def broadcast_alert(alert: Dict[str, Any]):
    # ⬇️ Save in buffer before sending
    transactions.append(alert)
    if len(transactions) > MAX_TX:
        del transactions[: len(transactions) - MAX_TX]

    for conn in list(active_connections):
        try:
            await conn.send_json(alert)
        except Exception:
            try: await conn.close()
            finally:
                if conn in active_connections:
                    active_connections.remove(conn)

# ⛔️ Ensure you have ONLY ONE /broadcast route, this one:
@app.post("/broadcast")
async def http_broadcast(alert: Dict[str, Any] = Body(...)):
    await broadcast_alert(alert)
    return {"ok": True, "stored": len(transactions)}

# Convenience test
@app.post("/_test_send")
async def _test_send():
    payload = {"user": "1234", "amount": 42.0, "fraud": 1}
    await broadcast_alert(payload)
    return {"ok": True}

# ⬇️ Transactions API for your UI
@app.get("/transactions")
def list_transactions():
    # Return newest first; trim to last 500 for the page
    return list(reversed(transactions[-500:]))
