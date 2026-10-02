import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


DATABASE_PATH = Path(os.environ.get("GREEN_GUARD_DB", "data/greenguard.db"))
DEMO_BOUNDARY = {
    "type": "Polygon",
    "coordinates": [[
        [73.58, 24.64],
        [73.75, 24.67],
        [73.82, 24.56],
        [73.74, 24.48],
        [73.59, 24.50],
        [73.58, 24.64],
    ]],
}


@contextmanager
def connect():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def initialize_database():
    with connect() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS zones (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                boundary_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Monitoring',
                region_type TEXT NOT NULL DEFAULT 'user'
            );
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                zone_id TEXT NOT NULL REFERENCES zones(id),
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                severity TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pending review',
                source TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS monitoring_points (
                id TEXT PRIMARY KEY,
                zone_id TEXT NOT NULL REFERENCES zones(id),
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'Demo placeholder'
            );
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                observation_type TEXT NOT NULL,
                observed_at TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                place TEXT NOT NULL,
                description TEXT NOT NULL,
                contact_email TEXT,
                created_at TEXT NOT NULL,
                transmission_status TEXT NOT NULL DEFAULT 'Not transmitted'
            );
        """)
        if db.execute("SELECT COUNT(*) FROM zones").fetchone()[0] == 0:
            db.execute(
                """INSERT INTO zones
                   (id, name, latitude, longitude, boundary_json, status, region_type)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    "demo-aravalli",
                    "Aravalli Hills — illustrative demo region",
                    24.58,
                    73.68,
                    json.dumps(DEMO_BOUNDARY),
                    "Demo monitoring",
                    "demo",
                ),
            )
            now = datetime.now(timezone.utc).isoformat()
            db.executemany(
                """INSERT INTO events
                   (id, zone_id, category, title, description, severity, status, source,
                    timestamp, latitude, longitude)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        "demo-event-1", "demo-aravalli", "Camera",
                        "Potential activity detected — human verification required.",
                        "Synthetic dashboard example only. No camera feed or real-world activity is represented.",
                        "Review", "Pending review", "Demo camera · illustrative",
                        now, 24.59, 73.66,
                    ),
                    (
                        "demo-event-2", "demo-aravalli", "Satellite",
                        "Change review example — no observation attached",
                        "Synthetic workflow example only. No satellite observation or change estimate is configured.",
                        "Info", "Pending review", "Demo workflow · illustrative",
                        now, 24.57, 73.70,
                    ),
                ],
            )
        demo_zone_exists = db.execute(
            "SELECT 1 FROM zones WHERE id = 'demo-aravalli'"
        ).fetchone()
        legacy_zone = db.execute(
            """SELECT latitude, longitude FROM zones
               WHERE id = 'demo-aravalli' AND region_type = 'demo'"""
        ).fetchone()
        if legacy_zone and abs(legacy_zone["latitude"] - 23.24) < 0.01 and abs(legacy_zone["longitude"] - 77.36) < 0.01:
            db.execute(
                """UPDATE zones SET latitude = ?, longitude = ?, boundary_json = ?
                   WHERE id = 'demo-aravalli'""",
                (24.58, 73.68, json.dumps(DEMO_BOUNDARY)),
            )
            db.execute(
                """UPDATE events SET latitude = ?, longitude = ?
                   WHERE id = 'demo-event-1' AND zone_id = 'demo-aravalli'""",
                (24.59, 73.66),
            )
            db.execute(
                """UPDATE events SET latitude = ?, longitude = ?
                   WHERE id = 'demo-event-2' AND zone_id = 'demo-aravalli'""",
                (24.57, 73.70),
            )
            db.execute(
                """UPDATE monitoring_points SET latitude = ?, longitude = ?
                   WHERE id = 'demo-cam-1' AND zone_id = 'demo-aravalli'""",
                (24.59, 73.66),
            )
            db.execute(
                """UPDATE monitoring_points SET latitude = ?, longitude = ?
                   WHERE id = 'demo-audio-1' AND zone_id = 'demo-aravalli'""",
                (24.57, 73.70),
            )
            db.execute(
                """UPDATE monitoring_points SET latitude = ?, longitude = ?
                   WHERE id = 'demo-audio-2' AND zone_id = 'demo-aravalli'""",
                (24.61, 73.72),
            )
        if (
            demo_zone_exists
            and db.execute("SELECT COUNT(*) FROM monitoring_points").fetchone()[0] == 0
        ):
            db.executemany(
                """INSERT INTO monitoring_points
                   (id, zone_id, name, kind, latitude, longitude)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                [
                    ("demo-cam-1", "demo-aravalli", "Demo camera placeholder", "camera", 24.59, 73.66),
                    ("demo-audio-1", "demo-aravalli", "Demo acoustic placeholder A", "acoustic", 24.57, 73.70),
                    ("demo-audio-2", "demo-aravalli", "Demo acoustic placeholder B", "acoustic", 24.61, 73.72),
                ],
            )


def list_zones():
    with connect() as db:
        rows = db.execute("SELECT * FROM zones ORDER BY name").fetchall()
        zones = []
        for row in rows:
            item = dict(row)
            item["boundary"] = json.loads(item.pop("boundary_json"))
            counts = db.execute(
                """SELECT kind, COUNT(*) AS count FROM monitoring_points
                   WHERE zone_id = ? GROUP BY kind""",
                (item["id"],),
            ).fetchall()
            item["cameras"] = sum(count["count"] for count in counts if count["kind"] == "camera")
            item["sensors"] = sum(count["count"] for count in counts if count["kind"] == "acoustic")
            zones.append(item)
        return zones


def list_monitoring_points():
    with connect() as db:
        rows = db.execute(
            """SELECT p.*, z.name AS zone_name FROM monitoring_points p
               JOIN zones z ON z.id = p.zone_id ORDER BY p.name"""
        ).fetchall()
        return [dict(row) for row in rows]


def create_monitoring_point(point):
    with connect() as db:
        db.execute(
            """INSERT INTO monitoring_points
               (id, zone_id, name, kind, latitude, longitude, status)
               VALUES (?, ?, ?, ?, ?, ?, 'Configured by user')""",
            (
                point["id"], point["zone_id"], point["name"], point["kind"],
                point["latitude"], point["longitude"],
            ),
        )
        row = db.execute(
            """SELECT p.*, z.name AS zone_name FROM monitoring_points p
               JOIN zones z ON z.id = p.zone_id WHERE p.id = ?""",
            (point["id"],),
        ).fetchone()
        return dict(row)


def create_zone(zone):
    with connect() as db:
        db.execute(
            """INSERT INTO zones
               (id, name, latitude, longitude, boundary_json, status, region_type)
               VALUES (?, ?, ?, ?, ?, ?, 'user')""",
            (
                zone["id"], zone["name"], zone["latitude"], zone["longitude"],
                json.dumps(zone["boundary"]), "Monitoring",
            ),
        )
    return next(item for item in list_zones() if item["id"] == zone["id"])


def list_events():
    with connect() as db:
        rows = db.execute(
            """SELECT e.*, z.name AS zone_name FROM events e
               JOIN zones z ON z.id = e.zone_id ORDER BY e.timestamp DESC"""
        ).fetchall()
        return [dict(row) for row in rows]


def create_demo_event(event):
    with connect() as db:
        db.execute(
            """INSERT INTO events
               (id, zone_id, category, title, description, severity, status, source,
                timestamp, latitude, longitude)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                event["id"], event["zone_id"], event["category"], event["title"],
                event["description"], event["severity"], event["status"],
                event["source"], event["timestamp"], event["latitude"],
                event["longitude"],
            ),
        )
        row = db.execute(
            """SELECT e.*, z.name AS zone_name FROM events e
               JOIN zones z ON z.id = e.zone_id WHERE e.id = ?""",
            (event["id"],),
        ).fetchone()
        return dict(row)


def update_event_status(event_id, status):
    with connect() as db:
        result = db.execute(
            "UPDATE events SET status = ? WHERE id = ?", (status, event_id)
        )
        if result.rowcount == 0:
            return None
        row = db.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        return dict(row)


def list_reports():
    with connect() as db:
        rows = db.execute(
            """SELECT id, observation_type, observed_at, latitude, longitude,
                      place, description, contact_email, created_at, transmission_status
               FROM reports ORDER BY created_at DESC"""
        ).fetchall()
        return [dict(row) for row in rows]


def create_report(report):
    with connect() as db:
        db.execute(
            """INSERT INTO reports
               (id, observation_type, observed_at, latitude, longitude, place,
                description, contact_email, created_at, transmission_status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Not transmitted')""",
            (
                report["id"], report["observation_type"], report["observed_at"],
                report["latitude"], report["longitude"], report["place"],
                report["description"], report.get("contact_email"),
                report["created_at"],
            ),
        )
        row = db.execute(
            """SELECT id, observation_type, observed_at, latitude, longitude,
                      place, description, contact_email, created_at, transmission_status
               FROM reports WHERE id = ?""",
            (report["id"],),
        ).fetchone()
        return dict(row)
