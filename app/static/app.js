(() => {
  const ARAVALLI = { latitude: 24.58, longitude: 73.68 };
  const state = {
    zones: [], points: [], events: [], map: null, layerControl: null, overlays: [],
    selectedPoint: null, uploadedBoundary: null, weatherLoaded: false, currentScreen: 'entry',
    filmIndex: 0, filmTimer: null, demoTimer: null, demoBusy: false, demoRemaining: 60,
    demoIndex: 0, demoCount: 0, soundEnabled: false, audioContext: null, toastTimer: null, cameraStream: null,
    reports: [], filmElapsed: 0, filmPlaying: false, filmPaused: false, mediaPreviewUrl: null,
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const stories = [
    {
      id: 'wildlife', index: '01 — KNOW THE LAND', title: 'Life in the hills',
      body: 'The Aravalli range contains varied dryland and forest habitats. Leopards, striped hyenas, jackals, nilgai and many birds are associated with parts of this broad landscape. Their presence at any particular place depends on local habitat and evidence; this prototype has no wildlife observations.',
      caveat: 'Regional wildlife examples only. They do not confirm an animal sighting at the illustrative Udaipur map pin.',
      source: 'https://forest.rajasthan.gov.in/',
    },
    {
      id: 'water', index: '02 — STONE & WATER', title: 'Water in a dry land',
      body: 'Ridges, soils, vegetation and seasonal drainage shape how rain moves through a landscape. The effects of land-use change depend on the specific catchment, geology, rainfall and communities. This prototype does not measure groundwater, river flow or watershed health.',
      caveat: 'Water benefits and risks are local and evidence-dependent; no hydrology data is connected here.',
      source: 'https://www.indiawaterportal.org/',
    },
    {
      id: 'people', index: '03 — PEOPLE & PLACE', title: 'A landscape people call home',
      body: 'Aravalli landscapes are connected to many towns, villages, livelihoods and cultural histories across multiple states. Responsible stewardship means listening to the people who live in each place, respecting land rights and using verified local information.',
      caveat: 'This is general context, not a description of a specific community or land parcel.',
      source: 'https://forest.rajasthan.gov.in/',
    },
    {
      id: 'pressure', index: '04 — WHY CARE MATTERS', title: 'If hills are lost',
      body: 'Clearing vegetation, fragmenting habitat or disturbing a watershed can affect ecological connections, soils and local water systems. Outcomes vary and should be assessed using credible local evidence—not assumed from an alert or a map image.',
      caveat: 'No damage, mining, tree cutting or other activity is being reported by this demo.',
      source: 'https://www.moef.gov.in/',
    },
  ];
  const filmDetails = [
    { location: 'UDAIPUR · RAJASTHAN', credit: 'TeshTesh · CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:A_view_of_Udaipur_Aravalli_Hills_Rajasthan_India.jpg' },
    { location: 'RAJASTHAN · ARAVALLI RANGE', credit: 'Adesh Kachhap · CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Rajasthan,_Aravalli_range.jpg' },
    { location: 'GURUGRAM · HARYANA', credit: 'Sudsahab · CC0', source: 'https://commons.wikimedia.org/wiki/File:Aravalli_Hills_near_Gurgaon.jpg' },
  ];
  const filmScenes = [
    {
      chapter: 'CHAPTER 01 · THE ANCIENT RIDGELINE',
      en: 'At first light, the hills are not silent. Wind moves through thorn and grass; birds stitch sound across the ridges. The Aravalli is an ancient range, shaped by time and weather. Each slope carries its own story of stone, soil, and life.',
      hi: 'सुबह की पहली रोशनी में ये पहाड़ खामोश नहीं होते। हवा झाड़ियों और घास से गुजरती है, और पक्षियों की आवाज़ें पहाड़ियों में गूंजती हैं। अरावली एक प्राचीन पर्वतमाला है, जिसे समय और मौसम ने आकार दिया है। हर ढलान पत्थर, मिट्टी और जीवन की अपनी कहानी कहती है।',
    },
    {
      chapter: 'CHAPTER 02 · WATER FINDS A WAY',
      en: 'After rain, a dry channel may briefly lead water downhill. Roots hold soil; rocky outcrops offer shelter. Across this long, varied range, habitats shift with place and season. These photographs show different Aravalli landscapes—not one continuous field recording.',
      hi: 'बारिश के बाद सूखी नदी-धाराओं में कुछ समय के लिए पानी बह सकता है। जड़ें मिट्टी को थामती हैं और चट्टानी जगहें जीवों को आश्रय देती हैं। इस लंबी पर्वतमाला में जगह और मौसम के साथ आवास बदलते हैं। ये तस्वीरें अलग-अलग अरावली दृश्यों की हैं—एक ही स्थान की लगातार रिकॉर्डिंग नहीं।',
    },
    {
      chapter: 'CHAPTER 03 · A FUTURE WE SHARE',
      en: 'People, wildlife, and working landscapes share these hills. Caring for them begins with listening, learning, and checking what we see. A map can guide attention, but it cannot prove an incident. Human knowledge matters. The hills’ future belongs to all of us.',
      hi: 'इन पहाड़ियों को लोग, वन्यजीव और कामकाजी परिदृश्य साझा करते हैं। उनकी देखभाल सुनने, सीखने और देखी गई बातों की पुष्टि से शुरू होती है। नक्शा ध्यान दिला सकता है, लेकिन किसी घटना का प्रमाण नहीं होता। स्थानीय समझ और मानवीय समीक्षा जरूरी हैं। इन पहाड़ियों का भविष्य हम सबका है।',
    },
  ];
  const demoSequence = ['Camera', 'Acoustic', 'Satellite'];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, options);
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try { message = (await response.json()).detail || message; } catch { /* Keep the HTTP status message. */ }
      throw new Error(message);
    }
    return response.json();
  }

  function notify(message) {
    const toast = $('#alert-toast');
    $('#alert-toast-text').textContent = message;
    toast.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => { toast.hidden = true; }, 6000);
  }

  function showScreen(name) {
    const screens = { entry: $('#entry-view'), landscape: $('#landscape-view'), guardian: $('#guardian-view') };
    if (!screens[name]) return;
    Object.entries(screens).forEach(([key, element]) => {
      element.classList.toggle('is-visible', key === name);
      element.hidden = key !== name;
    });
    state.currentScreen = name;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name === 'guardian') {
      window.setTimeout(() => state.map?.invalidateSize(), 100);
      if (!state.weatherLoaded) {
        state.weatherLoaded = true;
        loadWeather();
      }
    }
  }

  function updateClock() {
    $('#clock').textContent = new Intl.DateTimeFormat(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date());
  }

  function openStory(id) {
    const story = stories.find((item) => item.id === id);
    if (!story) return;
    $('#story-index').textContent = story.index;
    $('#story-title').textContent = story.title;
    $('#story-body').textContent = story.body;
    $('#story-caveat').textContent = story.caveat;
    $('#story-source').href = story.source;
    $('#story-next').dataset.story = stories[(stories.indexOf(story) + 1) % stories.length].id;
    $('#story-next').textContent = `Explore next story →`;
    $('#story-dialog').showModal();
  }

  function setFilm(index) {
    const images = $$('.film-image');
    const dots = $$('#film-dots button');
    state.filmIndex = (index + images.length) % images.length;
    images.forEach((image, i) => image.classList.toggle('is-active', i === state.filmIndex));
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === state.filmIndex);
      dot.setAttribute('aria-current', i === state.filmIndex ? 'true' : 'false');
    });
    const detail = filmDetails[state.filmIndex];
    $('#film-location').textContent = detail.location;
    $('#film-credit').textContent = detail.credit;
    $('#film-source').href = detail.source;
    $('#film-chapter').textContent = filmScenes[state.filmIndex].chapter;
    updateFilmCaption();
  }

  function updateFilmCaption() {
    const language = $('#film-language').value === 'hi-IN' ? 'hi' : 'en';
    $('#film-narration').textContent = filmScenes[state.filmIndex][language];
  }

  function speakFilmScene() {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      filmScenes[state.filmIndex][$('#film-language').value === 'hi-IN' ? 'hi' : 'en'],
    );
    utterance.lang = $('#film-language').value;
    utterance.rate = .92;
    utterance.pitch = .97;
    window.speechSynthesis.speak(utterance);
  }

  function updateFilmProgress() {
    const seconds = Math.min(state.filmElapsed, 90);
    const timestamp = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    $('#film-elapsed').textContent = `${timestamp} / 01:30`;
    $('#film-progress-fill').style.width = `${seconds / 90 * 100}%`;
    $('.film-progress').setAttribute('aria-valuenow', String(seconds));
  }

  function stopFilm(completed = false) {
    if (state.filmTimer) clearInterval(state.filmTimer);
    state.filmTimer = null;
    state.filmPlaying = false;
    state.filmPaused = !completed;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    $('#film-play').textContent = completed ? '↻ Replay story' : state.filmElapsed ? '▶ Resume story' : '▶ Play story';
    $('#film-play').setAttribute('aria-label', completed ? 'Replay the 90-second narrated Aravalli story' : state.filmElapsed ? 'Resume the narrated Aravalli story' : 'Play the 90-second narrated Aravalli story');
    $('#film-play').setAttribute('aria-pressed', 'false');
  }

  function startFilm() {
    if (state.filmPlaying) {
      stopFilm();
      return;
    }
    if (!state.filmPaused || state.filmElapsed >= 90) {
      state.filmElapsed = 0;
      setFilm(0);
      updateFilmProgress();
    }
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      notify('Your browser does not support voice narration. The 90-second photo film and captions will still play.');
    }
    state.filmPlaying = true;
    state.filmPaused = false;
    $('#film-play').textContent = 'Ⅱ Pause story';
    $('#film-play').setAttribute('aria-label', 'Pause the narrated Aravalli story');
    speakFilmScene();
    $('#film-play').setAttribute('aria-pressed', 'true');
    state.filmTimer = window.setInterval(() => {
      state.filmElapsed += 1;
      if (state.filmElapsed >= 90) {
        state.filmElapsed = 90;
        updateFilmProgress();
        stopFilm(true);
        return;
      }
      const chapter = Math.floor(state.filmElapsed / 30);
      if (chapter !== state.filmIndex) {
        setFilm(chapter);
        speakFilmScene();
      }
      updateFilmProgress();
    }, 1000);
  }

  function selectFilmChapter(index) {
    const chapter = (index + filmScenes.length) % filmScenes.length;
    setFilm(chapter);
    if (state.filmPlaying) state.filmElapsed = chapter * 30;
    updateFilmProgress();
    if (state.filmPlaying) speakFilmScene();
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
    const zone = state.zones.find((item) => item.id === 'demo-aravalli') || state.zones[0] || ARAVALLI;
    $('#weather-status').textContent = 'Refreshing regional weather model…';
    try {
      const query = new URLSearchParams({ latitude: Number(zone.latitude).toFixed(3), longitude: Number(zone.longitude).toFixed(3) });
      const data = await api(`/api/weather?${query}`);
      const current = data.current;
      if (!current || !Number.isFinite(current.temperature_2m)) throw new Error('Current regional conditions are unavailable.');
      const [description, symbol] = weatherDescription(current.weather_code);
      $('#weather-symbol').textContent = symbol;
      $('#weather-symbol').title = description;
      $('#weather-temperature').textContent = `${Math.round(current.temperature_2m)}°C`;
      $('#weather-humidity').textContent = `${Math.round(current.relative_humidity_2m)}%`;
      $('#weather-wind').textContent = `${Math.round(current.wind_speed_10m)} km/h`;
      $('#weather-location').textContent = `Near illustrative pin · ${data.latitude.toFixed(2)}, ${data.longitude.toFixed(2)}`;
      const time = current.time ? new Date(current.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'time unavailable';
      $('#weather-status').textContent = `${description} · model time ${time} · not a forest sensor`;
    } catch (error) {
      $('#weather-status').textContent = `Weather unavailable: ${error.message}`;
    }
  }

  function initMap() {
    const element = $('#map');
    if (!window.L) {
      element.innerHTML = '<div class="empty-events">Map library could not load. Internet access is required for the interactive map.</div>';
      return;
    }
    state.map = L.map(element, { zoomControl: false }).setView([ARAVALLI.latitude, ARAVALLI.longitude], 10);
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);
    const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18, attribution: 'Tiles &copy; Esri — imagery basemap only',
    });
    street.addTo(state.map);
    state.layerControl = L.control.layers({ 'Street map': street, 'Satellite basemap (imagery only)': satellite }, {}, { position: 'topright', collapsed: true }).addTo(state.map);
    state.map.on('click', (event) => {
      state.selectedPoint = event.latlng;
      $('#map-coordinates').textContent = `${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)} · selected`;
      $('#zone-lat').value = event.latlng.lat.toFixed(6);
      $('#zone-lng').value = event.latlng.lng.toFixed(6);
      $('#point-lat').value = event.latlng.lat.toFixed(6);
      $('#point-lng').value = event.latlng.lng.toFixed(6);
      $('#report-lat').value = event.latlng.lat.toFixed(6);
      $('#report-lng').value = event.latlng.lng.toFixed(6);
    });
  }

  function renderPointZones() {
    const options = state.zones.map((zone) =>
      `<option value="${escapeHtml(zone.id)}">${escapeHtml(zone.name)}</option>`).join('');
    $('#point-zone').innerHTML = options;
  }

  function renderZones() {
    if (!state.map) return;
    state.overlays.forEach((layer) => state.map.removeLayer(layer));
    state.overlays = [];
    state.zones.forEach((zone) => {
      if (zone.boundary) {
        const boundary = L.geoJSON(zone.boundary, {
          style: { color: '#c9d99f', weight: 2, opacity: .85, fillColor: '#8fb978', fillOpacity: .08, dashArray: '7 5' },
        }).addTo(state.map);
        state.overlays.push(boundary);
      }
      const marker = L.marker([zone.latitude, zone.longitude], {
        icon: L.divIcon({ className: '', html: '<span class="zone-marker">⌖</span>', iconSize: [31, 31], iconAnchor: [15, 15] }),
      }).bindPopup(`<strong>${escapeHtml(zone.name)}</strong><br><span style="color:#e2be82">Illustrative zone · not verified</span>`).addTo(state.map);
      state.overlays.push(marker);
    });
    state.points.forEach((point) => {
      const icon = point.kind === 'camera' ? '⌕' : point.kind === 'acoustic' ? '〰' : '◎';
      const marker = L.marker([point.latitude, point.longitude], {
        icon: L.divIcon({ className: '', html: `<span class="zone-marker">${icon}</span>`, iconSize: [31, 31], iconAnchor: [15, 15] }),
      }).bindPopup(`<strong>${escapeHtml(point.name)}</strong><br><span style="color:#e2be82">${escapeHtml(point.kind)} · ${escapeHtml(point.status)}</span>`).addTo(state.map);
      state.overlays.push(marker);
    });
    state.events.forEach((event) => {
      if (!Number.isFinite(event.latitude) || !Number.isFinite(event.longitude)) return;
      const simulated = String(event.source).includes('DEMO');
      const marker = L.marker([event.latitude, event.longitude], {
        icon: L.divIcon({ className: '', html: `<span class="risk-marker${simulated ? ' simulated' : ''}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
      }).bindPopup(`<strong>${escapeHtml(event.title)}</strong><br><span style="color:#e2be82">${simulated ? 'Synthetic example · no live observation' : 'Illustrative demo'} · human review required</span>`).addTo(state.map);
      state.overlays.push(marker);
    });
  }

  function eventStatusClass(status) {
    if (status === 'Verified') return 'status-verified';
    if (status === 'Dismissed') return 'status-dismissed';
    return '';
  }

  function renderEvents() {
    const filter = $('#event-filter').value;
    const events = filter === 'all' ? state.events : state.events.filter((event) => event.status === filter);
    const pending = state.events.filter((event) => event.status === 'Pending review').length;
    $('#review-count').textContent = pending;
    $('#rail-count').textContent = pending;
    if (!events.length) {
      $('#event-list').innerHTML = '<div class="empty-events">No events in this view. Demo alerts are synthetic; no real feeds are connected.</div>';
      return;
    }
    $('#event-list').innerHTML = events.map((event) => {
      const time = new Date(event.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const actions = event.status === 'Pending review'
        ? `<button class="verify" data-event="${escapeHtml(event.id)}" data-status="Verified">Mark reviewed</button><button data-event="${escapeHtml(event.id)}" data-status="Dismissed">Dismiss</button>`
        : `<button data-event="${escapeHtml(event.id)}" data-status="Pending review">Reopen</button>`;
      return `<article class="event-row"><div class="event-icon">${event.category === 'Satellite' ? '◉' : event.category === 'Acoustic' ? '〰' : '⌕'}</div><div class="event-main"><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.description)}</p><div class="event-meta"><span>${escapeHtml(event.source)}</span><span>·</span><span>${escapeHtml(event.zone_name || 'Illustrative region')}</span><span>·</span><time>${escapeHtml(time)}</time></div></div><div class="event-actions"><span class="status-tag ${eventStatusClass(event.status)}">${escapeHtml(event.status)}</span>${actions}</div></article>`;
    }).join('');
  }

  async function loadDashboard() {
    try {
      const [zones, points, events] = await Promise.all([api('/api/zones'), api('/api/points'), api('/api/events')]);
      state.zones = zones;
      state.points = points;
      state.events = events;
      renderPointZones();
      renderEvents();
      renderZones();
      const demoZone = zones.find((zone) => zone.id === 'demo-aravalli');
      if (demoZone) $('#rail-zone-name').textContent = demoZone.name.replace('— illustrative demo region', '').trim();
      if (!state.weatherLoaded && state.currentScreen === 'guardian') {
        state.weatherLoaded = true;
        loadWeather();
      }
    } catch (error) {
      notify(`Could not load monitoring view: ${error.message}`);
    }
  }

  async function changeEventStatus(id, status) {
    try {
      await api(`/api/events/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      await loadDashboard();
    } catch (error) {
      notify(`Could not update review status: ${error.message}`);
    }
  }

  async function emitDemoEvent(category) {
    if (state.demoBusy) return;
    state.demoBusy = true;
    $('#trigger-demo-button').disabled = true;
    try {
      await api('/api/demo/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, zone_id: state.zones[0]?.id || 'demo-aravalli' }),
      });
      state.demoCount += 1;
      await loadDashboard();
      notify('Synthetic demonstration alert created. It is not a real detection.');
      if (state.soundEnabled) playDemoTone();
    } finally {
      state.demoBusy = false;
      $('#trigger-demo-button').disabled = Boolean(state.demoTimer);
    }
  }

  function setDemoStatus(message, running = false) {
    const status = $('#demo-run-status');
    status.classList.toggle('is-running', running);
    $('span', status).textContent = message;
  }

  function stopDemo(completed = false, failed = false) {
    if (state.demoTimer) clearInterval(state.demoTimer);
    state.demoTimer = null;
    $('#start-demo-button').textContent = '▶ Run 60-sec story';
    $('#trigger-demo-button').disabled = false;
    $('#demo-starting-scenario').disabled = false;
    if (failed) setDemoStatus('Paused · could not save the synthetic event');
    else if (completed) setDemoStatus(`Complete · ${state.demoCount} synthetic events · review below`);
    else setDemoStatus('Ready · no real feeds connected');
  }

  async function startDemo() {
    if (state.demoTimer) {
      stopDemo();
      return;
    }
    if (!state.zones.length) {
      notify('Create a demo monitoring zone before starting.');
      return;
    }
    state.demoRemaining = 60;
    state.demoCount = 0;
    state.demoIndex = demoSequence.indexOf($('#demo-starting-scenario').value);
    $('#start-demo-button').disabled = true;
    $('#trigger-demo-button').disabled = true;
    $('#demo-starting-scenario').disabled = true;
    try {
      await emitDemoEvent(demoSequence[state.demoIndex]);
    } catch (error) {
      stopDemo(false, true);
      notify(`Could not start demo: ${error.message}`);
      return;
    }
    $('#start-demo-button').disabled = false;
    $('#start-demo-button').textContent = 'Ⅱ Pause demo';
    $('#trigger-demo-button').disabled = true;
    const sendAt = new Set([50, 35, 20]);
    setDemoStatus('Simulation running · 01:00 · synthetic events only', true);
    state.demoTimer = window.setInterval(async () => {
      state.demoRemaining -= 1;
      if (state.demoRemaining <= 0) {
        stopDemo(true);
        return;
      }
      if (sendAt.has(state.demoRemaining)) {
        state.demoIndex = (state.demoIndex + 1) % demoSequence.length;
        try { await emitDemoEvent(demoSequence[state.demoIndex]); }
        catch (error) { stopDemo(false, true); notify(`Demo paused: ${error.message}`); return; }
      }
      setDemoStatus(`Simulation running · 00:${String(state.demoRemaining).padStart(2, '0')} · synthetic only`, true);
    }, 1000);
  }

  function playDemoTone() {
    try {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return;
      state.audioContext ||= new AudioContextType();
      if (state.audioContext.state === 'suspended') state.audioContext.resume();
      const oscillator = state.audioContext.createOscillator();
      const gain = state.audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(740, state.audioContext.currentTime);
      oscillator.frequency.setValueAtTime(590, state.audioContext.currentTime + .13);
      gain.gain.setValueAtTime(.07, state.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, state.audioContext.currentTime + .27);
      oscillator.connect(gain).connect(state.audioContext.destination);
      oscillator.start();
      oscillator.stop(state.audioContext.currentTime + .28);
    } catch (error) {
      notify(`Demo tone unavailable: ${error.message}`);
    }
  }

  function setDemoSound() {
    state.soundEnabled = !state.soundEnabled;
    $('#sound-toggle').setAttribute('aria-pressed', String(state.soundEnabled));
    $('b', $('#sound-toggle')).textContent = state.soundEnabled ? 'Sound on' : 'Sound off';
    $('small', $('#sound-toggle')).textContent = state.soundEnabled ? 'Synthetic demo tone' : 'Demo tone only';
    if (state.soundEnabled) playDemoTone();
  }

  function makeBoundary(lat, lng) {
    const latOffset = .035, lngOffset = .045;
    return { type: 'Polygon', coordinates: [[[lng - lngOffset, lat - latOffset], [lng + lngOffset, lat - latOffset], [lng + lngOffset, lat + latOffset], [lng - lngOffset, lat + latOffset], [lng - lngOffset, lat - latOffset]]] };
  }

  async function saveZone(event) {
    event.preventDefault();
    $('#zone-error').textContent = '';
    try {
      await api('/api/zones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: $('#zone-name').value.trim(), latitude: Number($('#zone-lat').value),
          longitude: Number($('#zone-lng').value),
          boundary: state.uploadedBoundary || makeBoundary(Number($('#zone-lat').value), Number($('#zone-lng').value)),
        }),
      });
      $('#zone-dialog').close();
      $('#zone-form').reset();
      await loadDashboard();
      notify('Illustrative monitoring zone saved.');
    } catch (error) {
      $('#zone-error').textContent = error.message;
    }
  }

  async function savePoint(event) {
    event.preventDefault();
    $('#point-error').textContent = '';
    try {
      await api('/api/points', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_id: $('#point-zone').value, name: $('#point-name').value.trim(), kind: $('#point-kind').value,
          latitude: Number($('#point-lat').value), longitude: Number($('#point-lng').value),
        }),
      });
      $('#point-dialog').close();
      $('#point-form').reset();
      await loadDashboard();
      notify('Device marker saved; no sensor is connected.');
    } catch (error) {
      $('#point-error').textContent = error.message;
    }
  }

  async function searchLocation() {
    const query = $('#location-search').value.trim();
    if (!query) return;
    if (!state.map) { notify('The map is unavailable. Check your internet connection.'); return; }
    if (query.toLowerCase().includes('aravalli')) {
      state.map.setView([ARAVALLI.latitude, ARAVALLI.longitude], 10);
      return;
    }
    const button = $('#search-button');
    button.disabled = true;
    button.textContent = '…';
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(`Search service returned ${response.status}.`);
      const results = await response.json();
      if (!results.length) { notify('No matching location found.'); return; }
      state.map.setView([Number(results[0].lat), Number(results[0].lon)], 11);
      notify('Location found. Click the map to select coordinates.');
    } catch (error) {
      notify(`Location search unavailable: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = 'Search';
    }
  }

  function setReportResult(message, error = false) {
    const result = $('#report-result');
    result.textContent = message;
    result.dataset.state = error ? 'error' : 'success';
  }

  async function submitReport(event) {
    event.preventDefault();
    const report = {
      observation_type: $('#report-type').value,
      observed_at: new Date($('#report-time').value).toISOString(),
      latitude: Number($('#report-lat').value),
      longitude: Number($('#report-lng').value),
      place: $('#report-place').value.trim(),
      description: $('#report-description').value.trim(),
      contact_email: $('#report-contact').value.trim() || null,
    };
    try {
      const saved = await api('/api/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report),
      });
      const authorityEmail = $('#authority-email').value.trim();
      setReportResult(`Report ${saved.id} saved in ${saved.storage}. It has NOT been transmitted; no authority is notified.`);
      if (authorityEmail && window.confirm('This only opens your email app with a draft. GreenGuard will not send it. Continue?')) {
        const subject = encodeURIComponent(`Environmental observation report · ${report.place}`);
        const body = encodeURIComponent([
          'Personal observation (not independently verified)',
          `Type: ${report.observation_type}`,
          `Observed at: ${report.observed_at}`,
          `Approximate coordinates: ${report.latitude}, ${report.longitude}`,
          `Nearby place: ${report.place}`,
          `Description: ${report.description}`,
          report.contact_email ? `Contact email: ${report.contact_email}` : '',
          '',
          'Prepared with the GreenGuard independent prototype. Please verify this information through official channels.',
        ].filter(Boolean).join('\n'));
        window.location.href = `mailto:${encodeURIComponent(authorityEmail)}?subject=${subject}&body=${body}`;
        setReportResult(`Report ${saved.id} saved. An email draft was opened for your review; it was not sent.`);
      }
      $('#report-form').reset();
      setDefaultReportTime();
    } catch (error) {
      setReportResult(`Report was not saved: ${error.message}`, true);
    }
  }

  function setDefaultReportTime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    $('#report-time').value = now.toISOString().slice(0, 16);
  }

  async function inspectMedia(file) {
    const result = $('#media-result');
    if (file.type.startsWith('video/')) {
      const video = $('#camera-video');
      result.textContent = 'Checking this video in your browser…';
      try {
        if (video.readyState < 1) {
          await new Promise((resolve, reject) => {
            const timeout = window.setTimeout(() => reject(new Error('Video metadata timed out.')), 10000);
            video.addEventListener('loadedmetadata', () => { clearTimeout(timeout); resolve(); }, { once: true });
            video.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('This video could not be decoded by the browser.')); }, { once: true });
          });
        }
        if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
          throw new Error('The browser could not read this video’s dimensions and duration.');
        }
        const duration = Math.floor(video.duration);
        const length = `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`;
        result.textContent = `Video ready · ${video.videoWidth} × ${video.videoHeight} px · ${length} · stays in this browser. No AI detector is configured.`;
      } catch (error) {
        result.textContent = `${error.message} The clip stays in this browser; no AI analysis was performed.`;
      }
      return;
    }
    result.textContent = 'Checking selected image… no activity detection is configured.';
    const form = new FormData();
    form.append('file', file);
    try {
      const inspection = await api('/api/media/analyze', { method: 'POST', body: form });
      const dimensions = inspection.dimensions ? ` ${inspection.dimensions[0]} × ${inspection.dimensions[1]} px.` : '';
      result.textContent = `${inspection.message}${dimensions} This media was not saved.`;
    } catch (error) {
      result.textContent = `Media check failed: ${error.message}`;
    }
  }

  function releaseMediaPreview() {
    if (state.mediaPreviewUrl) URL.revokeObjectURL(state.mediaPreviewUrl);
    state.mediaPreviewUrl = null;
    const image = $('#image-preview');
    image.removeAttribute('src');
    image.dataset.objectUrl = '';
    image.hidden = true;
    const video = $('#camera-video');
    video.pause();
    video.srcObject = null;
    video.removeAttribute('src');
    video.load();
    video.hidden = true;
  }

  async function toggleWebcam() {
    const video = $('#camera-video');
    const button = $('#webcam-button');
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach((track) => track.stop());
      state.cameraStream = null;
      video.srcObject = null;
      video.hidden = true;
      $('#camera-placeholder').hidden = false;
      $('#capture-frame-button').hidden = true;
      button.textContent = '◎ Start my camera';
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      notify('Camera preview requires HTTPS or localhost and a supported browser.');
      return;
    }
    try {
      releaseMediaPreview();
      state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = state.cameraStream;
      video.hidden = false;
      video.controls = false;
      video.autoplay = true;
      video.muted = true;
      $('#camera-placeholder').hidden = true;
      $('#capture-frame-button').hidden = false;
      button.textContent = 'Stop my camera';
      $('#media-result').textContent = 'Private preview in this browser only. No field feed or analysis is connected.';
    } catch (error) {
      notify(`Camera permission unavailable: ${error.message}`);
    }
  }

  function captureCameraFrame() {
    const video = $('#camera-video');
    if (!video.videoWidth) { notify('Camera is still starting. Try again shortly.'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) { notify('Could not capture a local camera frame.'); return; }
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) inspectMedia(new File([blob], 'local-camera-frame.jpg', { type: 'image/jpeg' }));
      else notify('Could not create a local camera frame.');
    }, 'image/jpeg');
  }

  async function exportReports() {
    try {
      const reports = await api('/api/reports');
      const payload = {
        generated_at: new Date().toISOString(),
        note: 'User-submitted observations are unverified. No authority transmission is represented.',
        reports,
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'greenguard-saved-reports.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setReportResult(`Could not export reports: ${error.message}`, true);
    }
  }

  function wire() {
    $$('[data-screen]').forEach((button) => button.addEventListener('click', () => {
      showScreen(button.dataset.screen);
      $('#sidebar').classList.remove('is-open');
    }));
    $('#enter-landscape').addEventListener('click', () => showScreen('landscape'));
    $('#enter-watch').addEventListener('click', () => showScreen('guardian'));
    $$('[data-story]').forEach((button) => button.addEventListener('click', () => openStory(button.dataset.story)));
    $('#story-close').addEventListener('click', () => $('#story-dialog').close());
    $('#story-next').addEventListener('click', () => openStory($('#story-next').dataset.story));
    $('#film-prev').addEventListener('click', () => selectFilmChapter(state.filmIndex - 1));
    $('#film-next').addEventListener('click', () => selectFilmChapter(state.filmIndex + 1));
    $$('#film-dots button').forEach((button, index) => button.addEventListener('click', () => selectFilmChapter(index)));
    $('#film-play').addEventListener('click', startFilm);
    $('#film-language').addEventListener('change', () => {
      updateFilmCaption();
      if (state.filmPlaying) speakFilmScene();
    });
    $('#film-media').addEventListener('keydown', (event) => {
      if (event.code === 'Space' && event.target === $('#film-media')) {
        event.preventDefault();
        startFilm();
      }
    });
    $('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('is-open'));
    $$('[data-scroll]').forEach((button) => button.addEventListener('click', () => {
      document.getElementById(button.dataset.scroll).scrollIntoView({ behavior: 'smooth', block: 'start' });
      $$('.rail-nav button').forEach((item) => item.classList.toggle('active', item === button));
      $('#sidebar').classList.remove('is-open');
    }));
    $('#toast-close').addEventListener('click', () => { $('#alert-toast').hidden = true; });
    $('#map-layer-toggle').addEventListener('click', () => {
      const controls = $('.leaflet-control-layers');
      if (controls) controls.classList.toggle('leaflet-control-layers-expanded');
      else notify('Map layers unavailable while the map library is disconnected.');
    });
    $('#location-button').addEventListener('click', () => {
      if (!navigator.geolocation) { notify('This browser does not provide location access.'); return; }
      navigator.geolocation.getCurrentPosition((position) => state.map?.setView([position.coords.latitude, position.coords.longitude], 13),
        () => notify('Location permission was not granted or location is unavailable.'), { timeout: 8000 });
    });
    $('#add-zone-button').addEventListener('click', () => {
      if (!state.map) { notify('Map is unavailable.'); return; }
      const point = state.selectedPoint || state.map.getCenter();
      $('#zone-lat').value = point.lat.toFixed(6);
      $('#zone-lng').value = point.lng.toFixed(6);
      $('#zone-error').textContent = '';
      $('#zone-dialog').showModal();
    });
    $('#add-point-button').addEventListener('click', () => {
      if (!state.map) { notify('Map is unavailable.'); return; }
      if (!state.zones.length) { notify('Create a zone before adding a monitoring point.'); return; }
      const point = state.selectedPoint || state.map.getCenter();
      $('#point-lat').value = point.lat.toFixed(6);
      $('#point-lng').value = point.lng.toFixed(6);
      $('#point-error').textContent = '';
      $('#point-form').reset();
      renderPointZones();
      $('#point-lat').value = point.lat.toFixed(6);
      $('#point-lng').value = point.lng.toFixed(6);
      $('#point-dialog').showModal();
    });
    $('#close-zone').addEventListener('click', () => $('#zone-dialog').close());
    $('#close-point').addEventListener('click', () => $('#point-dialog').close());
    $('#zone-form').addEventListener('submit', saveZone);
    $('#point-form').addEventListener('submit', savePoint);
    $('#geojson-upload').addEventListener('change', async (event) => {
      state.uploadedBoundary = null;
      const file = event.target.files[0];
      if (!file) return;
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error('GeoJSON must be 5 MB or smaller.');
        const parsed = JSON.parse(await file.text());
        const geometry = parsed.type === 'Feature' ? parsed.geometry : parsed;
        if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) throw new Error('Choose a GeoJSON Polygon or MultiPolygon.');
        state.uploadedBoundary = geometry;
        $('#zone-error').textContent = 'Boundary loaded. Check coordinate accuracy and permissions before use.';
      } catch (error) {
        $('#zone-error').textContent = error.message;
        event.target.value = '';
      }
    });
    $('#event-filter').addEventListener('change', renderEvents);
    $('#event-list').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-event]');
      if (button) changeEventStatus(button.dataset.event, button.dataset.status);
    });
    $('#demo-starting-scenario').addEventListener('change', () => { state.demoIndex = demoSequence.indexOf($('#demo-starting-scenario').value); });
    $('#trigger-demo-button').addEventListener('click', () => emitDemoEvent($('#demo-starting-scenario').value).catch((error) => notify(`Could not create sample event: ${error.message}`)));
    $('#start-demo-button').addEventListener('click', startDemo);
    $('#sound-toggle').addEventListener('click', setDemoSound);
    $('#webcam-button').addEventListener('click', toggleWebcam);
    $('#capture-frame-button').addEventListener('click', captureCameraFrame);
    $('#media-upload').addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) {
        event.target.value = '';
        notify('Choose an image or video no larger than 20 MB.');
        return;
      }
      if (state.cameraStream) {
        state.cameraStream.getTracks().forEach((track) => track.stop());
        state.cameraStream = null;
        $('#camera-video').srcObject = null;
        $('#camera-video').hidden = true;
        $('#capture-frame-button').hidden = true;
        $('#webcam-button').textContent = '◎ Start my camera';
      }
      releaseMediaPreview();
      const previewUrl = URL.createObjectURL(file);
      if (file.type.startsWith('image/')) {
        const image = $('#image-preview');
        image.dataset.objectUrl = previewUrl;
        state.mediaPreviewUrl = previewUrl;
        image.src = previewUrl;
        image.hidden = false;
        $('#camera-video').hidden = true;
      } else if (file.type.startsWith('video/')) {
        state.mediaPreviewUrl = previewUrl;
        $('#image-preview').hidden = true;
        const video = $('#camera-video');
        video.srcObject = null;
        video.src = previewUrl;
        video.controls = true;
        video.autoplay = false;
        video.muted = false;
        video.hidden = false;
      } else {
        URL.revokeObjectURL(previewUrl);
        notify('Choose a supported image or video file.');
        return;
      }
      $('#camera-placeholder').hidden = true;
      $('#media-result').textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB · preview is local to this page.`;
      inspectMedia(file);
      event.target.value = '';
    });
    $('#search-button').addEventListener('click', searchLocation);
    $('#location-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); searchLocation(); } });
    $('#report-form').addEventListener('submit', submitReport);
    $('#export-reports').addEventListener('click', exportReports);
    window.addEventListener('pagehide', () => {
      if (state.cameraStream) state.cameraStream.getTracks().forEach((track) => track.stop());
      if (state.filmTimer) clearInterval(state.filmTimer);
      if (state.demoTimer) clearInterval(state.demoTimer);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (state.mediaPreviewUrl) URL.revokeObjectURL(state.mediaPreviewUrl);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initMap();
    wire();
    updateClock();
    setDefaultReportTime();
    window.setInterval(updateClock, 30000);
    window.setInterval(() => { if (state.currentScreen === 'guardian') loadWeather(); }, 5 * 60 * 1000);
    loadDashboard();
  });
})();
