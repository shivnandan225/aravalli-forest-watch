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
        [77.02, 23.39],
        [77.48, 23.49],
        [77.73, 23.26],
        [77.51, 22.98],
        [77.13, 23.03],
        [77.02, 23.39],
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
        """)
        if db.execute("SELECT COUNT(*) FROM zones").fetchone()[0] == 0:
            db.execute(
                """INSERT INTO zones
                   (id, name, latitude, longitude, boundary_json, status, region_type)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    "demo-aravalli",
                    "Aravalli Hills — illustrative demo region",
                    23.24,
                    77.36,
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
                        now, 23.29, 77.29,
                    ),
                    (
                        "demo-event-2", "demo-aravalli", "Satellite",
                        "Change review example — no observation attached",
                        "Synthetic workflow example only. No satellite observation or change estimate is configured.",
                        "Info", "Pending review", "Demo workflow · illustrative",
                        now, 23.18, 77.48,
                    ),
                ],
            )
        demo_zone_exists = db.execute(
            "SELECT 1 FROM zones WHERE id = 'demo-aravalli'"
        ).fetchone()
        if (
            demo_zone_exists
            and db.execute("SELECT COUNT(*) FROM monitoring_points").fetchone()[0] == 0
        ):
            db.executemany(
                """INSERT INTO monitoring_points
                   (id, zone_id, name, kind, latitude, longitude)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                [
                    ("demo-cam-1", "demo-aravalli", "Demo camera placeholder", "camera", 23.29, 77.29),
                    ("demo-audio-1", "demo-aravalli", "Demo acoustic placeholder A", "acoustic", 23.18, 77.48),
                    ("demo-audio-2", "demo-aravalli", "Demo acoustic placeholder B", "acoustic", 23.26, 77.57),
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
