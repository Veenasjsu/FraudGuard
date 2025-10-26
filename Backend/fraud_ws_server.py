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

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            alert = {"message": "something"}  # Example message
            await websocket.send_json(alert)
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        print("Client disconnected cleanly.")
    except asyncio.CancelledError:
        print("Task cancelled, likely due to server reload.")
    except Exception as e:
        print(f"Unexpected error: {e}")
    finally:
        await websocket.close()
        
