from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.conversions import router

app = FastAPI(title="OFX para Excel", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix="/api/v1")

@app.get("/api/v1/health")
def health():
    return {"status": "ok"}
