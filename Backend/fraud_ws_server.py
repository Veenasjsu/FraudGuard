from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import random
import uvicorn

app = FastAPI()

# Enable CORS for frontend on localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "WebSocket running at /ws/alerts"}

@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    while True:
        # Simulate a fake alert
        alert = {
            "user": random.choice(["Alice", "Bob", "Charlie"]),
            "amount": round(random.uniform(100, 1000), 2),
            "fraud": random.choice([0, 1])
        }
        await websocket.send_json(alert)
        await asyncio.sleep(3)  # simulate stream
