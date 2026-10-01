const state = {
  zones: [], points: [], events: [], map: null, layers: [], selectedPoint: null,
  cameraStream: null, uploadedBoundary: null, demoTimer: null, demoRemaining: 60,
  demoEventsSent: 0, nextDemoEventAt: 50, demoScenarioIndex: 0, demoBusy: false, weatherLoaded: false,
};
const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { message = (await response.json()).detail || message; } catch {}
    throw new Error(message);
  }
  return response.json();
}

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

function updateClock() {
  $('#clock').textContent = new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date());
}

function weatherDescription(code) {
  if (code === 0) return ['Clear sky', '☀'];
  if ([1, 2].includes(code)) return ['Partly cloudy', '◒'];
  if (code === 3) return ['Overcast', '☁'];
  if ([45, 48].includes(code)) return ['Fog', '≋'];
  if ([51, 53, 55, 56, 57].includes(code)) return ['Drizzle', '☂'];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['Rain', '☂'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Snow', '❄'];
  if ([95, 96, 99].includes(code)) return ['Thunderstorm', 'ϟ'];
  return ['Conditions available', '◉'];
}

async function loadWeather() {
  const zone = state.zones.find((item) => item.id === $('#demo-zone').value)
    || state.zones.find((item) => item.id === 'demo-aravalli')
    || state.zones[0];
  if (!zone) return;
  const status = $('#weather-status');
  status.textContent = 'Refreshing current regional model conditions…';
  try {
    const query = new URLSearchParams({
      latitude: zone.latitude.toFixed(3),
      longitude: zone.longitude.toFixed(3),
    });
    const data = await api(`/api/weather?${query}`);
    const current = data.current;
    if (!current || !Number.isFinite(current.temperature_2m)) {
      throw new Error('Current regional conditions are unavailable.');
    }
    const [description, symbol] = weatherDescription(current.weather_code);
    $('#weather-symbol').textContent = symbol;
    $('#weather-symbol').title = description;
    $('#weather-temperature').textContent = `${Math.round(current.temperature_2m)}°C`;
    $('#weather-humidity').textContent = `${Math.round(current.relative_humidity_2m)}%`;
    $('#weather-wind').textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    $('#weather-rain').textContent = `${Number(current.precipitation).toFixed(1)} mm`;
    const observedAt = current.time ? new Date(current.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'time unavailable';
    status.textContent = `${description} · Open-Meteo model time ${observedAt}`;
  } catch (error) {
    status.textContent = `Weather feed unavailable: ${error.message}`;
  }
}

function initMap() {
  const mapElement = $('#map');
  if (!window.L) {
    mapElement.innerHTML = '<div class="empty-events">Map library could not load. Connect to the internet to use the interactive map.</div>';
    return;
  }
  state.map = L.map(mapElement, { zoomControl: false }).setView([23.24, 77.36], 10);
  L.control.zoom({ position: 'bottomright' }).addTo(state.map);
  const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18, attribution: 'Tiles &copy; Esri — imagery basemap only',
  }).addTo(state.map);
  L.control.layers({ 'Street map': street, 'Satellite basemap (imagery only)': satellite }, {}, { position: 'topright', collapsed: true }).addTo(state.map);
  state.map.on('click', (event) => {
    state.selectedPoint = event.latlng;
    const selection = $('#map-selection');
    selection.hidden = false;
    selection.textContent = `${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`;
    $('#zone-lat').value = event.latlng.lat.toFixed(6);
    $('#zone-lng').value = event.latlng.lng.toFixed(6);
  });
  window.setTimeout(() => state.map.invalidateSize(), 100);
}

function renderZones() {
  $('#zone-count').textContent = state.zones.length;
  $('#zone-list').innerHTML = state.zones.map((zone) =>
    `<div class="zone-chip"><i></i><span>${escapeHtml(zone.name)}</span><small>${zone.latitude.toFixed(3)}, ${zone.longitude.toFixed(3)}</small></div>`
  ).join('');
  if (!state.map) return;
  state.layers.forEach((layer) => state.map.removeLayer(layer));
  state.layers = [];
  state.zones.forEach((zone) => {
    const boundary = L.geoJSON(zone.boundary, {
      style: { color: '#87d298', weight: 2, opacity: .8, fillColor: '#63ae75', fillOpacity: .09, dashArray: '7 5' },
    }).addTo(state.map);
    const marker = L.marker([zone.latitude, zone.longitude], {
      icon: L.divIcon({ className: '', html: '<span class="zone-marker">⌖</span>', iconSize: [31, 31], iconAnchor: [15, 15] }),
    }).bindPopup(`<strong>${escapeHtml(zone.name)}</strong><br><span style="color:#e2be82">Illustrative zone · not verified</span>`).addTo(state.map);
    state.layers.push(boundary, marker);
  });
  state.events.forEach((event) => {
    if (!Number.isFinite(event.latitude) || !Number.isFinite(event.longitude)) return;
    const isSimulation = event.source.startsWith('DEMO SIMULATION');
    const marker = L.marker([event.latitude, event.longitude], {
      icon: L.divIcon({
        className: '',
        html: `<span class="risk-marker${isSimulation ? ' simulated' : ''}"></span>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      }),
    }).bindPopup(`<strong>${escapeHtml(event.title)}</strong><br><span style="color:#e2be82">${isSimulation ? 'Synthetic walkthrough · no live observation' : 'Illustrative demo example'} · human review required</span>`).addTo(state.map);
    state.layers.push(marker);
  });
  state.points.forEach((point) => {
    const icon = point.kind === 'camera' ? '⌕' : point.kind === 'acoustic' ? '〰' : '◎';
    const marker = L.marker([point.latitude, point.longitude], {
      icon: L.divIcon({ className: '', html: `<span class="zone-marker">${icon}</span>`, iconSize: [31, 31], iconAnchor: [15, 15] }),
    }).bindPopup(`<strong>${escapeHtml(point.name)}</strong><br><span style="color:#e2be82">${escapeHtml(point.kind)} · ${escapeHtml(point.status)}</span>`).addTo(state.map);
    state.layers.push(marker);
  });
}

function renderOverview(overview) {
  $('#zone-count').textContent = overview.zone_count;
  $('#camera-count').textContent = overview.camera_count;
  $('#sensor-count').textContent = overview.sensor_count;
  $('#review-count').textContent = overview.pending_reviews;
  $('#nav-count').textContent = overview.pending_reviews;
  $('#db-status').textContent = 'SQLite · connected';
}

function eventStatusClass(status) {
  if (status === 'Verified') return 'status-verified';
  if (status === 'Dismissed') return 'status-dismissed';
  return 'status-review';
}

function renderEvents() {
  const filter = $('#event-filter').value;
  const events = filter === 'all' ? state.events : state.events.filter((event) => event.status === filter);
  if (!events.length) {
    $('#event-list').innerHTML = '<div class="empty-events">No events in this view.</div>';
    return;
  }
  $('#event-list').innerHTML = events.map((event) => {
    const time = new Date(event.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const actions = event.status === 'Pending review'
      ? `<button class="verify" data-event="${escapeHtml(event.id)}" data-status="Verified">Verify</button><button data-event="${escapeHtml(event.id)}" data-status="Dismissed">Dismiss</button>`
      : `<button data-event="${escapeHtml(event.id)}" data-status="Pending review">Reopen</button>`;
    return `<article class="event-row">
      <div class="event-icon">${event.category === 'Satellite' ? '◉' : '⌕'}</div>
      <div class="event-main"><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.description)}</p>
        <div class="event-meta"><span>${escapeHtml(event.source)}</span><span>·</span><span>${escapeHtml(event.zone_name)}</span><span>·</span><time>${escapeHtml(time)}</time></div>
      </div>
      <div class="event-actions"><span class="status-tag ${eventStatusClass(event.status)}">${escapeHtml(event.status)}</span>${actions}</div>
    </article>`;
  }).join('');
}

async function loadDashboard() {
  try {
    const [overview, zones, points, events, system] = await Promise.all([
      api('/api/overview'), api('/api/zones'), api('/api/points'), api('/api/events'), api('/api/system'),
    ]);
    state.zones = zones;
    state.points = points;
    state.events = events;
    renderPointZones();
    renderOverview(overview);
    renderZones();
    renderEvents();
    $('#camera-inventory').textContent = `${overview.camera_count} demo camera placeholder${overview.camera_count === 1 ? '' : 's'} · no live feed`;
    $('#sensor-inventory').textContent = `${overview.sensor_count} demo sensor placeholder${overview.sensor_count === 1 ? '' : 's'} · no audio feed`;
    $('#db-status').textContent = `${system.database} · connected`;
    if (!state.weatherLoaded) {
      state.weatherLoaded = true;
      loadWeather();
    }
  } catch (error) {
    notify(`Could not load dashboard: ${error.message}`);
  }
}

function renderPointZones() {
  const selectedZone = $('#point-zone');
  const demoZone = $('#demo-zone');
  const previousPointZone = selectedZone.value;
  const previousDemoZone = demoZone.value;
  selectedZone.innerHTML = state.zones.map((zone) =>
    `<option value="${escapeHtml(zone.id)}">${escapeHtml(zone.name)}</option>`
  ).join('');
  demoZone.innerHTML = state.zones.map((zone) =>
    `<option value="${escapeHtml(zone.id)}">${escapeHtml(zone.name)}</option>`
  ).join('');
  if (state.zones.some((zone) => zone.id === previousPointZone)) selectedZone.value = previousPointZone;
  if (state.zones.some((zone) => zone.id === previousDemoZone)) demoZone.value = previousDemoZone;
}

function updateDemoStatus(message, running = false) {
  const status = $('#demo-run-status');
  status.classList.toggle('is-running', running);
  status.querySelector('span').textContent = message;
}

function formatSeconds(seconds) {
  return `00:${String(seconds).padStart(2, '0')}`;
}

async function emitDemoEvent(category) {
  if (state.demoBusy) return;
  state.demoBusy = true;
  $('#trigger-demo-button').disabled = true;
  try {
    await api('/api/demo/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, zone_id: $('#demo-zone').value }),
    });
    state.demoEventsSent += 1;
    await loadDashboard();
    notify(`${category} walkthrough event added to human review.`);
  } finally {
    state.demoBusy = false;
    $('#trigger-demo-button').disabled = Boolean(state.demoTimer);
  }
}

function stopDemo(completed = false, failed = false) {
  if (state.demoTimer) window.clearInterval(state.demoTimer);
  state.demoTimer = null;
  state.demoBusy = false;
  $('#start-demo-button').disabled = false;
  $('#start-demo-button').innerHTML = '<span>▶</span> Run 60-sec demo';
  $('#trigger-demo-button').disabled = false;
  $('#demo-zone').disabled = false;
  $('#demo-starting-scenario').disabled = false;
  document.querySelector('.demo-console').classList.remove('is-simulating');
  if (failed) {
    updateDemoStatus('PAUSED · The demo service could not add an event');
  } else if (completed) {
    updateDemoStatus(`COMPLETE · ${state.demoEventsSent} synthetic events · review them below`);
  } else {
    updateDemoStatus('READY · Not connected to real sensors');
  }
}

async function startDemo() {
  if (state.demoTimer) {
    stopDemo();
    notify('Seminar simulation paused. Demo events remain in the review queue.');
    return;
  }
  if (!state.zones.length) {
    notify('Add a monitoring zone before starting the walkthrough.');
    return;
  }

  state.demoRemaining = 60;
  state.demoEventsSent = 0;
  state.nextDemoEventAt = 50;
  const firstScenario = $('#demo-starting-scenario').value;
  const sequence = ['Camera', 'Acoustic', 'Satellite'];
  state.demoScenarioIndex = sequence.indexOf(firstScenario);
  $('#start-demo-button').disabled = true;
  $('#start-demo-button').textContent = 'Starting…';
  $('#trigger-demo-button').disabled = true;
  $('#demo-zone').disabled = true;
  $('#demo-starting-scenario').disabled = true;
  try {
    await emitDemoEvent(sequence[state.demoScenarioIndex]);
  } catch (error) {
    stopDemo(false, true);
    notify(`Could not start walkthrough: ${error.message}`);
    return;
  }
  $('#start-demo-button').disabled = false;
  $('#start-demo-button').innerHTML = '<span>Ⅱ</span> Pause demo';
  $('#trigger-demo-button').disabled = true;
  document.querySelector('.demo-console').classList.add('is-simulating');
  updateDemoStatus(`SIMULATION RUNNING · ${formatSeconds(state.demoRemaining)} · SYNTHETIC ONLY`, true);

  state.demoTimer = window.setInterval(async () => {
    state.demoRemaining -= 1;
    if (state.demoRemaining <= 0) {
      stopDemo(true);
      return;
    }
    if (state.demoRemaining > 0 && state.demoRemaining === state.nextDemoEventAt) {
      state.nextDemoEventAt -= 10;
      state.demoScenarioIndex = (state.demoScenarioIndex + 1) % sequence.length;
      try {
        await emitDemoEvent(sequence[state.demoScenarioIndex]);
      } catch (error) {
        stopDemo(false, true);
        notify(`Walkthrough paused: ${error.message}`);
        return;
      }
    }
    updateDemoStatus(`SIMULATION RUNNING · ${formatSeconds(state.demoRemaining)} · SYNTHETIC ONLY`, true);
  }, 1000);
}

function updatePointTypeHelp() {
  const descriptions = {
    monitoring: 'Location marker only; it does not collect or analyze data.',
    camera: 'Inventory marker only. A live camera feed and compatible vision model are not connected.',
    acoustic: 'Inventory marker only. A live audio feed and compatible sound model are not connected.',
  };
  $('#point-kind-help').textContent = descriptions[$('#point-kind').value];
}

async function searchLocation() {
  const query = $('#location-search').value.trim();
  if (!query) return;
  if (!state.map) {
    notify('The map is unavailable. Connect to the internet and reload.');
    return;
  }
  if (query.toLowerCase().includes('aravalli')) {
    state.map.setView([23.24, 77.36], 10);
    return;
  }
  const button = $('#search-button');
  button.disabled = true;
  button.textContent = '…';
  try {
    const results = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`).then((response) => response.json());
    if (!results.length) {
      notify('No matching location found.');
      return;
    }
    const result = results[0];
    state.map.setView([Number(result.lat), Number(result.lon)], 11);
    notify('Location found. Click the map to choose a monitoring point.');
  } catch {
    notify('Location search is unavailable. Check your internet connection.');
  } finally {
    button.disabled = false;
    button.textContent = 'Search';
  }
}

function makeBoundary(lat, lng) {
  const latOffset = 0.035;
  const lngOffset = 0.045;
  return { type: 'Polygon', coordinates: [[
    [lng - lngOffset, lat - latOffset],
    [lng + lngOffset, lat - latOffset],
    [lng + lngOffset, lat + latOffset],
    [lng - lngOffset, lat + latOffset],
    [lng - lngOffset, lat - latOffset],
  ]] };
}

async function saveZone(event) {
  event.preventDefault();
  const latitude = Number($('#zone-lat').value);
  const longitude = Number($('#zone-lng').value);
  const name = $('#zone-name').value.trim();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    $('#zone-error').textContent = 'Choose a point on the map or enter valid coordinates.';
    return;
  }
  try {
    await api('/api/zones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, latitude, longitude, boundary: state.uploadedBoundary || makeBoundary(latitude, longitude) }),
    });
    $('#zone-dialog').close();
    $('#zone-form').reset();
    state.uploadedBoundary = null;
    await loadDashboard();
    notify('Demo monitoring zone created.');
  } catch (error) {
    $('#zone-error').textContent = error.message;
  }
}

async function savePoint(event) {
  event.preventDefault();
  const latitude = Number($('#point-lat').value);
  const longitude = Number($('#point-lng').value);
  try {
    await api('/api/points', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        zone_id: $('#point-zone').value,
        name: $('#point-name').value.trim(),
        kind: $('#point-kind').value,
        latitude,
        longitude,
      }),
    });
    $('#point-dialog').close();
    $('#point-form').reset();
    await loadDashboard();
    notify('Demo monitoring point added.');
  } catch (error) {
    $('#point-error').textContent = error.message;
  }
}

async function changeEventStatus(eventId, status) {
  try {
    await api(`/api/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    state.events = await api('/api/events');
    renderEvents();
    renderOverview(await api('/api/overview'));
    renderZones();
  } catch (error) {
    notify(`Could not update review status: ${error.message}`);
  }
}

async function inspectUpload(file) {
  const result = $('#media-result');
  result.textContent = 'Inspecting upload…';
  const form = new FormData();
  form.append('file', file);
  try {
    const inspection = await api('/api/media/analyze', { method: 'POST', body: form });
    const dimensions = inspection.dimensions ? ` ${inspection.dimensions[0]} × ${inspection.dimensions[1]} px.` : '';
    result.textContent = `${inspection.message}${dimensions} Media is not saved.`;
  } catch (error) {
    result.textContent = `Upload unavailable: ${error.message}`;
  }
}

async function startWebcam() {
  const button = $('#webcam-button');
  const video = $('#camera-video');
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
    video.srcObject = null;
    video.removeAttribute('src');
    video.controls = false;
    video.hidden = true;
    $('.camera-placeholder').hidden = false;
    button.textContent = 'Start webcam';
    $('#capture-frame-button').hidden = true;
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    notify('Webcam requires HTTPS or localhost and a supported browser.');
    return;
  }
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = state.cameraStream;
    video.hidden = false;
    $('.camera-placeholder').hidden = true;
    button.textContent = 'Stop webcam';
    $('#capture-frame-button').hidden = false;
    $('#media-result').textContent = 'Webcam preview is local to this browser. No analysis occurs until a frame is captured.';
  } catch {
    notify('Camera permission was not granted or the camera is unavailable.');
  }
}

async function captureWebcamFrame() {
  const video = $('#camera-video');
  if (!video.videoWidth) {
    notify('Camera is still starting. Try again in a moment.');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob((blob) => {
    if (blob) inspectUpload(new File([blob], 'webcam-frame.jpg', { type: 'image/jpeg' }));
  }, 'image/jpeg');
}

function exportReport() {
  const report = {
    generated_at: new Date().toISOString(),
    mode: 'DEMO DATA MODE',
    note: 'Synthetic configuration and workflow examples only. No verified live observations.',
    zones: state.zones,
    events: state.events,
    satellite_observations: null,
    live_risk_assessment: null,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'greenguard-demo-report.json';
  link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  updateClock();
  window.setInterval(updateClock, 30000);
  loadDashboard();
  $('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  document.querySelectorAll('.main-nav a').forEach((link) => link.addEventListener('click', () => $('#sidebar').classList.remove('open')));
  $('#theme-toggle').addEventListener('click', () => document.documentElement.classList.toggle('light-mode'));
  $('#banner-close').addEventListener('click', () => $('.demo-banner').remove());
  $('#start-demo-button').addEventListener('click', startDemo);
  $('#demo-zone').addEventListener('change', loadWeather);
  $('#trigger-demo-button').addEventListener('click', async () => {
    const category = $('#demo-starting-scenario').value;
    try {
      await emitDemoEvent(category);
    } catch (error) {
      notify(`Could not create sample event: ${error.message}`);
    }
  });
  $('#add-zone-button').addEventListener('click', () => {
    if (!state.map) {
      notify('The map is unavailable. Connect to the internet and reload.');
      return;
    }
    if (!state.selectedPoint) {
      const center = state.map.getCenter();
      $('#zone-lat').value = center.lat.toFixed(6);
      $('#zone-lng').value = center.lng.toFixed(6);
    }
    $('#zone-error').textContent = '';
    $('#zone-dialog').showModal();
  });
  $('#cancel-zone').addEventListener('click', () => $('#zone-dialog').close());
  $('#close-dialog').addEventListener('click', (event) => { event.preventDefault(); $('#zone-dialog').close(); });
  $('#zone-form').addEventListener('submit', saveZone);
  $('#add-point-button').addEventListener('click', () => {
    if (!state.map) {
      notify('The map is unavailable. Connect to the internet and reload.');
      return;
    }
    const point = state.selectedPoint || state.map.getCenter();
    $('#point-lat').value = point.lat.toFixed(6);
    $('#point-lng').value = point.lng.toFixed(6);
    $('#point-error').textContent = '';
    renderPointZones();
    if (!state.zones.length) {
      notify('Create a monitoring zone before adding a point.');
      return;
    }
    $('#point-dialog').showModal();
  });
  $('#cancel-point').addEventListener('click', () => $('#point-dialog').close());
  $('#close-point-dialog').addEventListener('click', (event) => { event.preventDefault(); $('#point-dialog').close(); });
  $('#point-form').addEventListener('submit', savePoint);
  $('#point-kind').addEventListener('change', updatePointTypeHelp);
  $('#geojson-upload').addEventListener('change', async (event) => {
    state.uploadedBoundary = null;
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('GeoJSON boundary must be 5 MB or smaller.');
      const parsed = JSON.parse(await file.text());
      const geometry = parsed.type === 'Feature' ? parsed.geometry : parsed;
      if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) ||
          !Array.isArray(geometry.coordinates) || !geometry.coordinates.length) {
        throw new Error('Choose a GeoJSON Polygon or MultiPolygon.');
      }
      state.uploadedBoundary = geometry;
      $('#zone-error').textContent = 'Boundary loaded. Select its center on the map or enter coordinates.';
    } catch (error) {
      $('#zone-error').textContent = error.message || 'Could not read this GeoJSON file.';
      event.target.value = '';
    }
  });
  $('#zone-dialog').addEventListener('close', () => {
    state.uploadedBoundary = null;
    $('#geojson-upload').value = '';
  });
  $('#event-filter').addEventListener('change', renderEvents);
  $('#event-list').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-event]');
    if (button) changeEventStatus(button.dataset.event, button.dataset.status);
  });
  $('#search-button').addEventListener('click', searchLocation);
  $('#location-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') searchLocation(); });
  $('#media-upload').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const image = $('#image-preview');
    const video = $('#camera-video');
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach((track) => track.stop());
      state.cameraStream = null;
      $('#webcam-button').textContent = 'Start webcam';
      $('#capture-frame-button').hidden = true;
    }
    if (file.type.startsWith('image/')) {
      image.src = URL.createObjectURL(file);
      image.hidden = false;
      video.hidden = true;
      $('.camera-placeholder').hidden = true;
    } else {
      image.hidden = true;
      const previewUrl = URL.createObjectURL(file);
      video.srcObject = null;
      video.src = previewUrl;
      video.controls = true;
      video.hidden = false;
      $('.camera-placeholder').hidden = true;
    }
    inspectUpload(file);
    event.target.value = '';
  });
  $('#webcam-button').addEventListener('click', startWebcam);
  $('#capture-frame-button').addEventListener('click', captureWebcamFrame);
  $('#export-report').addEventListener('click', exportReport);
  $('#location-search').value = 'Aravalli Hills — illustrative demo region';
  window.setInterval(loadWeather, 5 * 60 * 1000);
});
