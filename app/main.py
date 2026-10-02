import json
import math
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app import database
from app.detector import detector


APP_DIR = Path(__file__).parent
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
REVIEW_STATUSES = {"Pending review", "Verified", "Dismissed"}

app = FastAPI(
    title="GreenGuard AI",
    description="Forest monitoring prototype — demo data unless verified providers are configured.",
    version="0.1.0",
)
app.mount("/static", StaticFiles(directory=APP_DIR / "static"), name="static")


class ZoneInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    boundary: dict


class EventReview(BaseModel):
    status: str


class MonitoringPointInput(BaseModel):
    zone_id: str
    name: str = Field(min_length=2, max_length=80)
    kind: Literal["monitoring", "camera", "acoustic"]
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class DemoEventInput(BaseModel):
    category: Literal["Camera", "Acoustic", "Satellite"]
    zone_id: str = "demo-aravalli"


class ReportInput(BaseModel):
    observation_type: Literal[
        "Possible tree cutting",
        "Possible mining or excavation",
        "Wildlife concern",
        "Fire or smoke observed",
        "Other environmental concern",
    ]
    observed_at: datetime
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    place: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=5, max_length=1200)
    contact_email: str | None = Field(default=None, max_length=254)


def valid_position(position):
    return (
        isinstance(position, list)
        and len(position) >= 2
        and all(
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value)
            for value in position[:2]
        )
        and -180 <= position[0] <= 180
        and -90 <= position[1] <= 90
    )


def valid_polygon(coordinates):
    if not isinstance(coordinates, list) or not coordinates:
        return False
    for ring in coordinates:
        if not isinstance(ring, list) or len(ring) < 4:
            return False
        if not all(valid_position(position) for position in ring):
            return False
        if ring[0][:2] != ring[-1][:2]:
            return False
    return True


def valid_boundary(boundary):
    coordinates = boundary.get("coordinates")
    if boundary.get("type") == "Polygon":
        return valid_polygon(coordinates)
    return (
        boundary.get("type") == "MultiPolygon"
        and isinstance(coordinates, list)
        and bool(coordinates)
        and all(valid_polygon(polygon) for polygon in coordinates)
    )


@app.on_event("startup")
def startup():
    database.initialize_database()


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(APP_DIR / "static" / "index.html")


@app.get("/api/system")
def system_status():
    return {
        "status": "online",
        "mode": "DEMO DATA MODE",
        "satellite_provider": "not configured",
        "detection_model": "not configured",
        "database": "SQLite",
        "observations": "No verified live observations",
        "server_time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/weather")
def regional_weather(
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
):
    parameters = urlencode({
        "latitude": round(latitude, 3),
        "longitude": round(longitude, 3),
        "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
        "timezone": "auto",
    })
    request = Request(
        f"https://api.open-meteo.com/v1/forecast?{parameters}",
        headers={"User-Agent": "GreenGuardAI/0.1 environmental-monitoring-prototype"},
    )
    try:
        with urlopen(request, timeout=8) as response:
            weather = json.loads(response.read())
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(
            502,
            "The Open-Meteo regional weather feed is temporarily unavailable.",
        ) from exc
    current = weather.get("current")
    if not isinstance(current, dict) or "temperature_2m" not in current:
        raise HTTPException(502, "The Open-Meteo response did not include current conditions.")
    return {
        "provider": "Open-Meteo",
        "latitude": weather.get("latitude"),
        "longitude": weather.get("longitude"),
        "timezone": weather.get("timezone"),
        "current": current,
    }


@app.get("/api/zones")
def zones():
    return database.list_zones()


@app.post("/api/zones", status_code=201)
def add_zone(zone: ZoneInput):
    if not zone.name.strip():
        raise HTTPException(422, "Zone name cannot be empty.")
    if not valid_boundary(zone.boundary):
        raise HTTPException(422, "Boundary must be a valid GeoJSON Polygon or MultiPolygon with closed rings and valid coordinates.")
    zone_id = f"zone-{uuid.uuid4().hex[:10]}"
    return database.create_zone({
        "id": zone_id,
        "name": zone.name.strip(),
        "latitude": zone.latitude,
        "longitude": zone.longitude,
        "boundary": zone.boundary,
    })


@app.get("/api/points")
def monitoring_points():
    return database.list_monitoring_points()


@app.post("/api/points", status_code=201)
def add_monitoring_point(point: MonitoringPointInput):
    if not point.name.strip():
        raise HTTPException(422, "Monitoring point name cannot be empty.")
    if point.zone_id not in {zone["id"] for zone in database.list_zones()}:
        raise HTTPException(404, "Monitoring zone not found.")
    return database.create_monitoring_point({
        "id": f"point-{uuid.uuid4().hex[:10]}",
        "zone_id": point.zone_id,
        "name": point.name.strip(),
        "kind": point.kind,
        "latitude": point.latitude,
        "longitude": point.longitude,
    })


@app.get("/api/events")
def events():
    return database.list_events()


@app.patch("/api/events/{event_id}")
def review_event(event_id: str, review: EventReview):
    if review.status not in REVIEW_STATUSES:
        raise HTTPException(422, f"Status must be one of: {', '.join(sorted(REVIEW_STATUSES))}.")
    event = database.update_event_status(event_id, review.status)
    if event is None:
        raise HTTPException(404, "Event not found.")
    return event


@app.get("/api/reports")
def reports():
    return database.list_reports()


@app.post("/api/reports", status_code=201)
def create_report(report: ReportInput):
    place = report.place.strip()
    description = report.description.strip()
    contact_email = report.contact_email.strip() if report.contact_email else None
    if len(place) < 2 or len(description) < 5:
        raise HTTPException(422, "Place and description must contain meaningful text.")
    if contact_email and not re.fullmatch(
        r"[^@\s]+@[^@\s]+\.[^@\s]+", contact_email
    ):
        raise HTTPException(422, "Contact email must be a valid email address.")
    saved = database.create_report({
        "id": f"report-{uuid.uuid4().hex[:10]}",
        "observation_type": report.observation_type,
        "observed_at": report.observed_at.isoformat(),
        "latitude": report.latitude,
        "longitude": report.longitude,
        "place": place,
        "description": description,
        "contact_email": contact_email,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    saved["storage"] = "local SQLite database"
    return saved


@app.post("/api/demo/events", status_code=201)
def create_demo_event(event: DemoEventInput):
    zone = next(
        (zone for zone in database.list_zones() if zone["id"] == event.zone_id),
        None,
    )
    if zone is None:
        raise HTTPException(404, "Monitoring zone not found.")

    offsets = {"Camera": (-0.012, -0.018), "Acoustic": (0.009, 0.016), "Satellite": (-0.006, 0.024)}
    latitude_offset, longitude_offset = offsets[event.category]
    descriptions = {
        "Camera": "Synthetic camera-motion scenario for the seminar demonstration. No camera is connected and no real-world activity is represented.",
        "Acoustic": "Synthetic acoustic-sensor scenario for the seminar demonstration. No audio is recorded or analyzed.",
        "Satellite": "Synthetic satellite-review scenario for the seminar demonstration. No satellite observation or change estimate is configured.",
    }
    return database.create_demo_event({
        "id": f"demo-sim-{uuid.uuid4().hex[:12]}",
        "zone_id": zone["id"],
        "category": event.category,
        "title": "Potential activity detected — human verification required.",
        "description": descriptions[event.category],
        "severity": "Review",
        "status": "Pending review",
        "source": f"DEMO SIMULATION · {event.category}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "latitude": max(-90, min(90, zone["latitude"] + latitude_offset)),
        "longitude": max(-180, min(180, zone["longitude"] + longitude_offset)),
    })


@app.get("/api/overview")
def overview():
    zones = database.list_zones()
    events = database.list_events()
    return {
        "zone_count": len(zones),
        "camera_count": sum(zone["cameras"] for zone in zones),
        "sensor_count": sum(zone["sensors"] for zone in zones),
        "pending_reviews": sum(event["status"] == "Pending review" for event in events),
        "health": "No verified live data",
        "satellite_change": None,
    }


@app.post("/api/media/analyze")
async def inspect_media(file: UploadFile = File(...)):
    content_type = file.content_type or ""
    if content_type.startswith("image/"):
        media_type = "image"
    elif content_type.startswith("video/"):
        media_type = "video"
    else:
        raise HTTPException(415, "Upload an image or video. Audio analysis is not configured.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Maximum upload size is 20 MB.")
    if not content:
        raise HTTPException(400, "The uploaded file is empty.")
    result = detector.inspect(content, media_type)
    return {
        "filename": file.filename or "upload",
        "media_type": result.media_type,
        "readable": result.readable,
        "dimensions": result.dimensions,
        "provider": result.provider,
        "message": result.message,
        "human_verification_required": True,
        "persisted": False,
    }
