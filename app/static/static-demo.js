(() => {
  const storageKey = 'greenguard-pages-demo-v1';
  const center = [23.24, 77.36];
  const boundary = {
    type: 'Polygon',
    coordinates: [[
      [77.02, 23.39], [77.48, 23.49], [77.73, 23.26],
      [77.51, 22.98], [77.13, 23.03], [77.02, 23.39],
    ]],
  };

  function initialData() {
    const now = new Date().toISOString();
    return {
      zones: [{
        id: 'demo-aravalli',
        name: 'Aravalli Hills — illustrative demo region',
        latitude: center[0],
        longitude: center[1],
        boundary,
        status: 'Demo monitoring',
        region_type: 'demo',
      }],
      points: [
        { id: 'demo-cam-1', zone_id: 'demo-aravalli', name: 'Demo camera placeholder', kind: 'camera', latitude: 23.29, longitude: 77.29, status: 'Demo placeholder' },
        { id: 'demo-audio-1', zone_id: 'demo-aravalli', name: 'Demo acoustic placeholder A', kind: 'acoustic', latitude: 23.18, longitude: 77.48, status: 'Demo placeholder' },
        { id: 'demo-audio-2', zone_id: 'demo-aravalli', name: 'Demo acoustic placeholder B', kind: 'acoustic', latitude: 23.26, longitude: 77.57, status: 'Demo placeholder' },
      ],
      events: [
        {
          id: 'demo-event-1', zone_id: 'demo-aravalli', category: 'Camera',
          title: 'Potential activity detected — human verification required.',
          description: 'Synthetic dashboard example only. No camera feed or real-world activity is represented.',
          severity: 'Review', status: 'Pending review', source: 'Demo camera · illustrative',
          timestamp: now, latitude: 23.29, longitude: 77.29,
        },
        {
          id: 'demo-event-2', zone_id: 'demo-aravalli', category: 'Satellite',
          title: 'Change review example — no observation attached',
          description: 'Synthetic workflow example only. No satellite observation or change estimate is configured.',
          severity: 'Info', status: 'Pending review', source: 'Demo workflow · illustrative',
          timestamp: now, latitude: 23.18, longitude: 77.48,
        },
      ],
    };
  }

  function loadData() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      if (stored && Array.isArray(stored.zones) && Array.isArray(stored.points) && Array.isArray(stored.events)) {
        return stored;
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
    return initialData();
  }

  let data = loadData();

  function persist() {
    localStorage.setItem(storageKey, JSON.stringify(data));
  }

  function jsonResponse(value, status = 200) {
    return new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function overview() {
    return {
      zone_count: data.zones.length,
      camera_count: data.points.filter((point) => point.kind === 'camera').length,
      sensor_count: data.points.filter((point) => point.kind === 'acoustic').length,
      pending_reviews: data.events.filter((event) => event.status === 'Pending review').length,
      health: 'No verified live data',
      satellite_change: null,
    };
  }

  async function weather(url) {
    const query = new URLSearchParams({
      latitude: Number(url.searchParams.get('latitude')).toFixed(3),
      longitude: Number(url.searchParams.get('longitude')).toFixed(3),
      current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code',
      timezone: 'auto',
    });
    const response = await window.fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
    if (!response.ok) return jsonResponse({ detail: 'The Open-Meteo regional weather feed is temporarily unavailable.' }, 502);
    const payload = await response.json();
    return jsonResponse({
      provider: 'Open-Meteo',
      latitude: payload.latitude,
      longitude: payload.longitude,
      timezone: payload.timezone,
      current: payload.current,
    });
  }

  async function inspectMedia(request) {
    const file = (await request.formData()).get('file');
    if (!(file instanceof File) || !file.size) {
      return jsonResponse({ detail: 'The uploaded file is empty.' }, 400);
    }
    if (file.size > 20 * 1024 * 1024) {
      return jsonResponse({ detail: 'Maximum upload size is 20 MB.' }, 413);
    }
    if (file.type.startsWith('image/')) {
      try {
        const image = await createImageBitmap(file);
        const dimensions = [image.width, image.height];
        image.close();
        return jsonResponse({
          filename: file.name,
          media_type: 'image',
          readable: true,
          dimensions,
          provider: 'unconfigured',
          message: 'Image decoded in your browser. No object-detection model is configured; no activity finding was generated.',
          human_verification_required: true,
          persisted: false,
        });
      } catch {
        return jsonResponse({
          filename: file.name,
          media_type: 'image',
          readable: false,
          dimensions: null,
          provider: 'unconfigured',
          message: 'The image could not be decoded. No activity finding was generated.',
          human_verification_required: true,
          persisted: false,
        });
      }
    }
    if (file.type.startsWith('video/')) {
      return jsonResponse({
        filename: file.name,
        media_type: 'video',
        readable: true,
        dimensions: null,
        provider: 'unconfigured',
        message: 'Video received. Frame analysis is unavailable until a detection model is configured.',
        human_verification_required: true,
        persisted: false,
      });
    }
    return jsonResponse({ detail: 'Upload an image or video. Audio analysis is not configured.' }, 415);
  }

  async function routeApi(path, request) {
    const method = request.method.toUpperCase();
    if (path === '/api/overview' && method === 'GET') return jsonResponse(overview());
    if (path === '/api/zones' && method === 'GET') return jsonResponse(data.zones);
    if (path === '/api/points' && method === 'GET') {
      return jsonResponse(data.points.map((point) => ({
        ...point,
        zone_name: data.zones.find((zone) => zone.id === point.zone_id)?.name ?? 'Unknown zone',
      })));
    }
    if (path === '/api/events' && method === 'GET') {
      return jsonResponse(data.events
        .map((event) => ({
          ...event,
          zone_name: data.zones.find((zone) => zone.id === event.zone_id)?.name ?? 'Unknown zone',
        }))
        .sort((first, second) => second.timestamp.localeCompare(first.timestamp)));
    }
    if (path === '/api/system' && method === 'GET') {
      return jsonResponse({
        status: 'online',
        mode: 'DEMO DATA MODE',
        satellite_provider: 'not configured',
        detection_model: 'not configured',
        database: 'Browser local storage (GitHub Pages)',
        observations: 'No verified live observations',
        server_time: new Date().toISOString(),
      });
    }
    if (path === '/api/weather' && method === 'GET') return weather(new URL(request.url));
    if (path === '/api/media/analyze' && method === 'POST') return inspectMedia(request);

    if (path === '/api/zones' && method === 'POST') {
      const zone = await request.json();
      const id = `zone-${crypto.randomUUID().slice(0, 10)}`;
      const saved = { ...zone, id, status: 'Monitoring', region_type: 'user' };
      data.zones.push(saved);
      persist();
      return jsonResponse({ ...saved, cameras: 0, sensors: 0 }, 201);
    }
    if (path === '/api/points' && method === 'POST') {
      const point = await request.json();
      if (!data.zones.some((zone) => zone.id === point.zone_id)) {
        return jsonResponse({ detail: 'Monitoring zone not found.' }, 404);
      }
      const saved = { ...point, id: `point-${crypto.randomUUID().slice(0, 10)}`, status: 'Configured by user' };
      data.points.push(saved);
      persist();
      return jsonResponse({
        ...saved,
        zone_name: data.zones.find((zone) => zone.id === saved.zone_id).name,
      }, 201);
    }
    if (path === '/api/demo/events' && method === 'POST') {
      const input = await request.json();
      const offsets = {
        Camera: [-0.012, -0.018],
        Acoustic: [0.009, 0.016],
        Satellite: [-0.006, 0.024],
      };
      const zone = data.zones.find((item) => item.id === input.zone_id);
      if (!zone || !offsets[input.category]) {
        return jsonResponse({ detail: 'Choose a valid demo zone and scenario.' }, 422);
      }
      const [latitude, longitude] = offsets[input.category];
      const details = {
        Camera: 'Synthetic camera-motion scenario for the seminar demonstration. No camera is connected and no real-world activity is represented.',
        Acoustic: 'Synthetic acoustic-sensor scenario for the seminar demonstration. No audio is recorded or analyzed.',
        Satellite: 'Synthetic satellite-review scenario for the seminar demonstration. No satellite observation or change estimate is configured.',
      };
      const event = {
        id: `demo-sim-${crypto.randomUUID().slice(0, 12)}`,
        zone_id: zone.id,
        category: input.category,
        title: 'Potential activity detected — human verification required.',
        description: details[input.category],
        severity: 'Review',
        status: 'Pending review',
        source: `DEMO SIMULATION · ${input.category}`,
        timestamp: new Date().toISOString(),
        latitude: zone.latitude + latitude,
        longitude: zone.longitude + longitude,
      };
      data.events.push(event);
      persist();
      return jsonResponse({ ...event, zone_name: zone.name }, 201);
    }
    const reviewMatch = path.match(/^\/api\/events\/([^/]+)$/);
    if (reviewMatch && method === 'PATCH') {
      const event = data.events.find((item) => item.id === decodeURIComponent(reviewMatch[1]));
      if (!event) return jsonResponse({ detail: 'Event not found.' }, 404);
      const update = await request.json();
      if (!['Pending review', 'Verified', 'Dismissed'].includes(update.status)) {
        return jsonResponse({ detail: 'Invalid review status.' }, 422);
      }
      event.status = update.status;
      persist();
      return jsonResponse(event);
    }
    return jsonResponse({ detail: 'Not found.' }, 404);
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url, window.location.href);
    if (url.pathname.startsWith('/api/')) return routeApi(url.pathname, request);
    return originalFetch(input, init);
  };
})();
