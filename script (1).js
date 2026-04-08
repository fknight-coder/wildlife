// ═══════════════════════════════════════════════════
//  SPIRIT — Wildlife Intelligence System
//  script.js
// ═══════════════════════════════════════════════════

// ── FIREBASE CONFIG ──────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDPicDOQj13hEWS6Ywmm3CwHHZmiJf1VNM",
  authDomain: "unplugged-spirit-818a6.firebaseapp.com",
  databaseURL: "https://unplugged-spirit-818a6-default-rtdb.firebaseio.com",
  projectId: "unplugged-spirit-818a6",
  storageBucket: "unplugged-spirit-818a6.firebasestorage.app",
  messagingSenderId: "1012597888526",
  appId: "1:1012597888526:web:17014b8696f03c7a914e5f"
};

// ── GEMINI CONFIG ────────────────────────────────
const GEMINI_API_KEY = "AIzaSyCbl1QSxX7AjxiII8OB8TRQ5J8teRqBCqo";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// ── GEMINI PROMPT ────────────────────────────────
const GEMINI_PROMPT = `You are an AI wildlife detection system in a tiger safari reserve in India.
Analyze this image and respond ONLY in this exact JSON format with no extra text, no markdown, no backticks:
{
  "species": "Tiger or Elephant or Deer or Leopard or Unknown",
  "confidence": 0.00,
  "count": 1,
  "behavior": "resting or moving or feeding or alert or unknown",
  "predicted_route": "one sentence where this animal is likely heading next",
  "predicted_zone": "A or B or C",
  "predicted_time": "time window like 06:30 AM - 07:00 AM",
  "ranger_action": "one sentence what the ranger should do right now",
  "threat_level": "low or medium or high"
}
If no animal is visible, set species to Unknown and confidence to 0.`;

// ── INIT FIREBASE ────────────────────────────────
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ── HELPERS ──────────────────────────────────────
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5)    return 'just now';
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function speciesEmoji(s) {
  const map = { Tiger:'🐯', Elephant:'🐘', Deer:'🦌', Leopard:'🐆', Unknown:'❓' };
  return map[s] || '🐾';
}

function speciesColor(s) {
  const map = {
    Tiger:'#ff6b35', Elephant:'#7eb8f7',
    Deer:'#a8e6a3', Leopard:'#d4a8f7', Unknown:'#3d6644'
  };
  return map[s] || '#3d6644';
}

// ── LIVE CLOCK ───────────────────────────────────
function updateClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('en-IN', { hour12: false });
}
updateClock();
setInterval(updateClock, 1000);

// ── CONNECTION STATUS ────────────────────────────
db.ref('.info/connected').on('value', snap => {
  const connected = snap.val();
  const dot   = document.getElementById('conn-dot');
  const label = document.getElementById('conn-label');
  if (connected) {
    dot.style.background  = '#00ff88';
    dot.style.boxShadow   = '0 0 6px #00ff88';
    label.textContent     = 'FIREBASE CONNECTED';
  } else {
    dot.style.background  = '#ff3355';
    dot.style.boxShadow   = '0 0 6px #ff3355';
    label.textContent     = 'DISCONNECTED';
  }
});

// ── ECO SCORE ────────────────────────────────────
db.ref('/eco_score').on('value', snap => {
  const d = snap.val();
  if (!d) return;
  const score = d.score ?? 0;

  document.getElementById('eco-num').textContent = score;

  const arc    = document.getElementById('eco-arc');
  const offset = 427.3 - (427.3 * score / 100);
  arc.style.strokeDashoffset = offset;

  let color, statusTxt, statusCls;
  if (score >= 70)      { color = '#00ff88'; statusTxt = 'OPTIMAL';  statusCls = 'good'; }
  else if (score >= 40) { color = '#ffb300'; statusTxt = 'DEGRADED'; statusCls = 'warn'; }
  else                  { color = '#ff3355'; statusTxt = 'CRITICAL'; statusCls = 'crit'; }

  arc.style.stroke = color;
  const num = document.getElementById('eco-num');
  num.style.color      = color;
  num.style.textShadow = `0 0 30px ${color}80`;

  const st = document.getElementById('eco-status');
  st.textContent = statusTxt;
  st.className   = `eco-status ${statusCls}`;

  if (d.computed_at)
    document.getElementById('eco-time').textContent = 'Updated ' + timeAgo(d.computed_at);
});

// ── ZONES ─────────────────────────────────────────
db.ref('/zones').on('value', snap => {
  const zones = snap.val();
  if (!zones) return;

  let lockedCount = 0;
  const grid = document.getElementById('zone-grid');

  grid.innerHTML = Object.entries(zones).map(([id, z]) => {
    const locked = z.locked;
    if (locked) lockedCount++;
    const di = z.di_score || 0;
    const diColor = di >= 3 ? '#ff3355' : di >= 2 ? '#ffb300' : '#00ff88';
    return `<div class="zone-tile ${locked ? 'locked' : ''}">
      <div class="zone-id">ZONE ${id}</div>
      <div class="zone-vehicles">${z.vehicle_count || 0} / ${z.capacity || 5} VEH</div>
      <div class="zone-di" style="color:${diColor}">DI ${di.toFixed(2)}</div>
      <div class="zone-chip ${locked ? 'locked' : 'open'}">${locked ? '🔒 LOCKED' : '● OPEN'}</div>
    </div>`;
  }).join('');

  const efZones = document.getElementById('ef-zones');
  efZones.textContent = lockedCount > 0
    ? `-${lockedCount * 10} pts (${lockedCount} locked)` : 'No penalty';
  efZones.style.color = lockedCount > 0 ? '#ff3355' : '#00ff88';
});

// ── WATERHOLES ────────────────────────────────────
db.ref('/waterholes').on('value', snap => {
  const holes = snap.val();
  if (!holes) return;

  let lowCount = 0;
  const list = document.getElementById('waterhole-list');

  list.innerHTML = Object.entries(holes).map(([id, w]) => {
    const maxLevel  = w.threshold * 2;
    const pct       = Math.min(100, (w.level_cm / maxLevel) * 100);
    const isCrit    = w.level_cm < w.threshold * 0.5;
    const isLow     = w.level_cm < w.threshold;
    if (isLow) lowCount++;

    const barColor  = isCrit
      ? 'linear-gradient(90deg,#7f1d1d,#ff3355)'
      : isLow
        ? 'linear-gradient(90deg,#7c4000,#ffb300)'
        : 'linear-gradient(90deg,#004d29,#00ff88)';

    const statusColor = isCrit ? '#ff3355' : isLow ? '#ffb300' : '#00ff88';
    const statusText  = isCrit
      ? '▲ CRITICAL — HALVING ZONE CAPACITY'
      : isLow ? '▲ BELOW THRESHOLD — RANGER ALERT'
      : '● NORMAL LEVEL';

    const threshPct = (w.threshold / maxLevel) * 100;

    return `<div class="waterhole-item">
      <div class="wh-header">
        <div class="wh-name">${id}</div>
        <div class="wh-level" style="color:${statusColor}">
          ${w.level_cm}cm <span style="color:#3d6644">/ ${w.threshold}cm threshold</span>
        </div>
      </div>
      <div class="wh-track">
        <div class="wh-fill" style="width:${pct}%;background:${barColor}"></div>
        <div class="wh-threshold-marker" style="left:${threshPct}%"></div>
      </div>
      <div class="wh-status" style="color:${statusColor}">${statusText}</div>
    </div>`;
  }).join('');

  const efWater = document.getElementById('ef-water');
  efWater.textContent = lowCount > 0
    ? `-${lowCount * 15} pts (${lowCount} below threshold)` : 'No penalty';
  efWater.style.color = lowCount > 0 ? '#ffb300' : '#00ff88';
});

// ── ANIMAL DETECTIONS ─────────────────────────────
db.ref('/animals').orderByChild('timestamp').limitToLast(12).on('value', snap => {
  const items = [];
  snap.forEach(c => { const d = c.val(); if (d.timestamp > 0) items.unshift(d); });

  const grid = document.getElementById('detect-grid');
  if (!items.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1">AWAITING DETECTIONS...</div>';
    return;
  }

  let unknownCount = 0;
  grid.innerHTML = items.map(d => {
    if (d.species === 'Unknown') unknownCount++;
    const confPct = Math.round(d.confidence * 100);
    return `<div class="detect-item ${d.species}">
      <div class="detect-species">${speciesEmoji(d.species)} ${d.species}</div>
      <div class="detect-meta">
        <span>ZONE ${d.zone}</span>
        <span>${confPct}% CONF</span>
      </div>
      <div class="conf-bar"><div class="conf-fill" style="width:${confPct}%"></div></div>
      <div class="detect-ago">${timeAgo(d.timestamp)}</div>
    </div>`;
  }).join('');

  const efUnknown = document.getElementById('ef-unknown');
  efUnknown.textContent = unknownCount > 0
    ? `-${unknownCount * 5} pts (${unknownCount} flagged)` : 'No penalty';
  efUnknown.style.color = unknownCount > 0 ? '#ffb300' : '#00ff88';
});

// ── DAILY PREDICTION ──────────────────────────────
db.ref('/predictions/daily').on('value', snap => {
  const d = snap.val();
  if (!d) return;
  const s = d.predicted_species || '—';

  document.getElementById('pred-icon').textContent    = speciesEmoji(s);
  document.getElementById('pred-species').textContent = s;
  document.getElementById('pred-species').style.color = speciesColor(s);
  document.getElementById('pred-conf').textContent    = `${Math.round((d.confidence || 0) * 100)}% CONFIDENCE`;
  document.getElementById('pred-meta').textContent    = `Expected at ${d.time || '—'} · Zone ${d.zone || '—'}`;
  document.getElementById('pred-bar').style.width     = `${Math.round((d.confidence || 0) * 100)}%`;

  if (d.predicted_route)
    document.getElementById('pred-route').textContent = '📍 ' + d.predicted_route;
  if (d.ranger_action)
    document.getElementById('pred-action').textContent = '⚡ ' + d.ranger_action;
});

// ── ALERTS ────────────────────────────────────────
db.ref('/alerts').orderByChild('timestamp').limitToLast(15).on('value', snap => {
  const items = [];
  snap.forEach(c => { const d = c.val(); if (d.timestamp > 0) items.unshift(d); });

  const strip = document.getElementById('alert-strip');
  if (!items.length) {
    strip.innerHTML = '<div class="empty">NO ALERTS</div>';
    return;
  }

  strip.innerHTML = items.map(a => {
    const isTiger = a.message?.toLowerCase().includes('tiger');
    const cls = isTiger ? 'tiger' : a.type === 'gate' ? 'gate' : a.type === 'water' ? 'water' : 'info';
    return `<div class="alert-row ${cls}">
      <div class="alert-msg">${a.message || '—'}</div>
      <div class="alert-zone">ZONE ${a.zone || '—'}</div>
      <div class="alert-time">${timeAgo(a.timestamp)}</div>
    </div>`;
  }).join('');
});

// ═══════════════════════════════════════════════════
//  CAMERA + GEMINI DETECTION
// ═══════════════════════════════════════════════════

let cameraStream = null;

// Start Camera
async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    const video = document.getElementById('camera-video');
    video.srcObject = cameraStream;

    // Hide overlay
    document.getElementById('video-overlay').style.display = 'none';

    // Enable detect button
    document.getElementById('detect-btn').disabled = false;

    // Update start button
    const startBtn = document.getElementById('start-cam-btn');
    startBtn.textContent = '⏹ STOP CAMERA';
    startBtn.onclick = stopCamera;

  } catch (err) {
    document.getElementById('video-overlay').innerHTML =
      `<span>⚠️</span><p style="color:#ff3355">CAMERA ACCESS DENIED<br><small>${err.message}</small></p>`;
  }
}

// Stop Camera
function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('camera-video');
  video.srcObject = null;
  document.getElementById('video-overlay').style.display = 'flex';
  document.getElementById('video-overlay').innerHTML = '<span>📷</span><p>Click START CAMERA to begin</p>';
  document.getElementById('detect-btn').disabled = true;

  const startBtn = document.getElementById('start-cam-btn');
  startBtn.textContent = '▶ START CAMERA';
  startBtn.onclick = startCamera;
}

// ── ROBUST JSON EXTRACTOR ────────────────────────
// Handles cases where Gemini wraps JSON in extra text, markdown, or commentary
function extractJSON(rawText) {
  if (!rawText || rawText.trim() === '') {
    throw new Error('Gemini returned an empty response. Check your API key or quota.');
  }

  // Step 1: strip markdown code fences
  let cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  // Step 2: try direct parse first (best case)
  try { return JSON.parse(cleaned); } catch (_) {}

  // Step 3: extract first { ... } block from the text
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
  }

  // Step 4: nothing worked — throw with the raw text for debugging
  throw new Error(`Could not parse Gemini response. Raw: ${rawText.substring(0, 200)}`);
}

// Capture frame and send to Gemini
async function captureAndDetect() {
  const video    = document.getElementById('camera-video');
  const canvas   = document.getElementById('camera-canvas');
  const zone     = document.getElementById('zone-select').value;

  // Draw video frame to canvas
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  // Convert to base64
  const base64Image = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

  // Show loading
  showLoading();

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: GEMINI_PROMPT },
            { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
          ]
        }]
      })
    });

    // Check HTTP status before parsing
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errBody.substring(0, 200)}`);
    }

    const data = await response.json();

    // Check for API-level errors in response body
    if (data.error) {
      throw new Error(`Gemini error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // Check for safety blocks or empty candidates
    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new Error('Gemini returned no candidates. The image may have been blocked by safety filters.');
    }
    if (candidate.finishReason === 'SAFETY') {
      throw new Error('Gemini blocked this image due to safety filters. Try a different image.');
    }

    const rawText = candidate.content?.parts?.[0]?.text || '';

    // Robust JSON extraction
    const result = extractJSON(rawText);
    showResult(result, zone);
    pushToFirebase(result, zone);

  } catch (err) {
    showError(err.message);
  }
}

// Show loading state
function showLoading() {
  document.getElementById('result-empty').style.display   = 'none';
  document.getElementById('result-data').style.display    = 'none';
  document.getElementById('result-loading').style.display = 'flex';
  document.getElementById('push-confirm').style.display   = 'none';
}

// Show result
function showResult(r, zone) {
  document.getElementById('result-loading').style.display = 'none';
  document.getElementById('result-empty').style.display   = 'none';
  document.getElementById('result-data').style.display    = 'block';

  const species  = r.species || 'Unknown';
  const confPct  = Math.round((r.confidence || 0) * 100);
  const threat   = r.threat_level || 'low';

  document.getElementById('r-emoji').textContent   = speciesEmoji(species);
  document.getElementById('r-species').textContent = species;
  document.getElementById('r-species').style.color = speciesColor(species);
  document.getElementById('r-count').textContent   = `${r.count || 1} animal(s) detected`;

  const threatBadge = document.getElementById('r-threat');
  threatBadge.textContent = `${threat === 'low' ? '🟢' : threat === 'medium' ? '🟡' : '🔴'} ${threat.toUpperCase()}`;
  threatBadge.className   = `threat-badge ${threat}`;

  document.getElementById('r-conf-fill').style.width = `${confPct}%`;
  document.getElementById('r-conf-pct').textContent  = `${confPct}%`;

  document.getElementById('r-behavior').textContent = r.behavior || '—';
  document.getElementById('r-pzone').textContent    = `Zone ${r.predicted_zone || zone}`;
  document.getElementById('r-time').textContent     = r.predicted_time || '—';
  document.getElementById('r-route').textContent    = r.predicted_route || '—';
  document.getElementById('r-action').textContent   = r.ranger_action || '—';
}

// Show error
function showError(msg) {
  document.getElementById('result-loading').style.display = 'none';
  document.getElementById('result-data').style.display    = 'none';
  document.getElementById('result-empty').style.display   = 'flex';
  document.getElementById('result-empty').innerHTML =
    `<div style="font-size:2rem">⚠️</div><div style="color:#ff3355">Error: ${msg}</div>`;
}

// Push result to Firebase
function pushToFirebase(result, zone) {
  const ts      = Date.now();
  const species = result.species || 'Unknown';
  const emoji   = speciesEmoji(species);

  // Animal detection
  db.ref(`/animals/${ts}`).set({
    species:    species,
    confidence: parseFloat((result.confidence || 0).toFixed(2)),
    zone:       zone,
    count:      result.count || 1,
    behavior:   result.behavior || 'unknown',
    timestamp:  ts
  });

  // Route prediction
  db.ref('/predictions/daily').set({
    predicted_species: species,
    confidence:        parseFloat((result.confidence || 0).toFixed(2)),
    predicted_route:   result.predicted_route || '—',
    zone:              result.predicted_zone || zone,
    time:              result.predicted_time || '—',
    ranger_action:     result.ranger_action || '—',
    behavior:          result.behavior || 'unknown',
    timestamp:         ts
  });

  // Alert
  db.ref(`/alerts/${ts}`).set({
    message:   `${emoji} ${species} in Zone ${zone} | ${Math.round((result.confidence || 0) * 100)}% conf | ${result.predicted_route || ''}`,
    type:      species === 'Tiger' ? 'tiger' : 'animal',
    zone:      zone,
    timestamp: ts
  });

  // Recalculate eco score
  recalcEcoScore();

  // Show confirm
  const confirm = document.getElementById('push-confirm');
  confirm.style.display = 'block';
  setTimeout(() => { confirm.style.display = 'none'; }, 3000);
}

// Recalculate Eco Score
function recalcEcoScore() {
  let score = 100;
  const oneHourAgo = Date.now() - 3600000;

  db.ref('/zones').once('value', snap => {
    const zones = snap.val() || {};
    Object.values(zones).forEach(z => { if (z.locked) score -= 10; });

    db.ref('/waterholes').once('value', snap2 => {
      const holes = snap2.val() || {};
      Object.values(holes).forEach(w => {
        if (w.level_cm < w.threshold) score -= 15;
      });

      db.ref('/animals').once('value', snap3 => {
        snap3.forEach(c => {
          const a = c.val();
          if (a.species === 'Unknown' && a.timestamp > oneHourAgo) score -= 5;
        });

        db.ref('/eco_score').set({
          score:       Math.max(0, score),
          computed_at: Date.now()
        });
      });
    });
  });
}
