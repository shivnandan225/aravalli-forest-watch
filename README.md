# GreenGuard AI

**Eyes in the Sky. Eyes on the Ground.**

GreenGuard AI is a runnable environmental-monitoring prototype built with FastAPI, SQLite, Leaflet, and a replaceable computer-vision provider interface.

## Run locally

Requires Python 3.10+.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Open (https://shivnandan225.github.io/github-copilot-seminar/). The interactive map uses online OpenStreetMap tiles; its optional satellite basemap uses Esri World Imagery. Internet access is needed for those map tiles and Leaflet assets.

Set `GREEN_GUARD_DB` to a file path to keep the SQLite database somewhere other than `data/greenguard.db`.

## GitHub Pages deployment

The GitHub Actions workflow publishes the frontend to GitHub Pages. GitHub Pages cannot run FastAPI or SQLite, so its static build enables a browser-local demo API instead; zones, monitoring points, and review statuses persist in that browser's local storage. The weather card uses Open-Meteo directly from the browser. The local FastAPI run remains the full backend prototype. A successful deployment URL is printed on the workflow's GitHub Pages environment.

## Data and safety

The app starts in **DEMO DATA MODE**. The selectable “Aravalli Hills — illustrative demo region” center and boundary, monitoring devices, risk shading, and timeline examples are synthetic placeholders. They are not verified forest boundaries, device feeds, incidents, or satellite observations.

Satellite imagery is an optional visual basemap only. No live satellite observation provider or change-detection feed is configured; comparison dates and change estimates are intentionally unavailable. Add a verified provider before displaying those outputs.

The regional weather card fetches current model conditions from Open-Meteo via the FastAPI backend near the selected zone coordinates and refreshes every five minutes. It is an approximate weather-model estimate, not a reading from a forest sensor or an observation of forest health.

Uploaded media is inspected for basic image readability/metadata only. No object-detection model is configured. The detector interface can be replaced with a vetted model provider; this prototype never classifies a person or establishes that a crime occurred. Any future AI-generated event must be worded **“Potential activity detected — human verification required.”** Automated change detection can produce false positives and requires verification.

The app accepts user-drawn demo zones and image/video uploads for the prototype. It does not persist uploaded media. Browser webcam capture requires the user's permission. Acoustic monitoring is represented as configurable demo sensor inventory; there is no audio capture or analysis.

The **Run 60-sec demo** control plays a synthetic camera/acoustic/satellite review story through the map and human-verification queue. **Sample alert** creates one synthetic review item. These seminar walkthrough controls are not live monitoring and make no real-world detections.

## API

- `GET /api/overview`, `/api/zones`, `/api/points`, `/api/events`, `/api/system`
- `GET /api/weather?latitude=23.24&longitude=77.36` proxies current regional model weather from Open-Meteo.
- `POST /api/zones` creates a zone with a GeoJSON Polygon or MultiPolygon boundary.
- `POST /api/points` registers a monitoring point, camera placeholder, or acoustic-sensor placeholder in a zone.
- `POST /api/demo/events` creates a clearly marked, human-reviewable synthetic event for the walkthrough.
- `PATCH /api/events/{event_id}` updates an event's human-review status.
- `POST /api/media/analyze` inspects an image/video upload and reports the configured provider state.
- Interactive API documentation: `/docs`
