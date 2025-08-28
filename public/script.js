// public/script.js
document.addEventListener('DOMContentLoaded', () => {
  // -----------------------------
  // API base (no process.env)
  // -----------------------------
  const apiOverride = document.currentScript?.dataset?.apiBase;
  const API_BASE = apiOverride
    || (window.location.hostname.includes('localhost')
        ? 'http://localhost:3000'
        : window.location.origin);

  const $ = (id) => document.getElementById(id);

  const safeJson = async (res) => { try { return await res.json(); } catch { return {}; } };

  const safeFetch = async (url, opts = {}) => {
    try {
      const res = await fetch(url, opts);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.message || data?.error || `Request failed (${res.status})`);
      return data;
    } catch (err) {
      console.error('Fetch error:', err);
      throw err;
    }
  };

  const getNum = (id) => {
    const el = $(id);
    if (!el) return NaN;
    const raw = ('value' in el) ? el.value : el.textContent;
    const n = parseFloat(String(raw).trim());
    return Number.isFinite(n) ? n : NaN;
  };

  // -----------------------------
  // AUTH: Login
  // -----------------------------
  const loginForm = $('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmers_id = $('farmers_id')?.value?.trim();
      const password   = $('password')?.value;
      if (!farmers_id || !password) return alert('Please enter ID and password.');

      try {
        await safeFetch(`${API_BASE}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ farmers_id, password })
        });
        window.location.href = '/home';
      } catch (err) {
        alert(`Login failed: ${err.message}`);
      }
    });
  }

  // -----------------------------
  // AUTH: Registration
  // -----------------------------
  const registerForm = $('signup_form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(registerForm);
      const payload = {
        farmers_id: fd.get('farmers_id'),
        fullName: fd.get('name'),
        contact: fd.get('contact'),
        land_size: fd.get('land_size'),
        soil_type: fd.get('soil_type'),
        password: fd.get('password'),
        confirmPassword: fd.get('confirm_password')
      };

      if (!payload.farmers_id || !payload.password) return alert('Farmer ID and password are required.');
      if (payload.password !== payload.confirmPassword) return alert('Passwords do not match.');

      try {
        await safeFetch(`${API_BASE}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        window.location.href = '/home';
      } catch (err) {
        alert(`Registration failed: ${err.message}`);
      }
    });
  }

  // -----------------------------
  // WEATHER (via backend proxy)
  // -----------------------------
  let cachedTemp = null;
  let cachedHumidity = null;

  const displayWeatherError = (msg = 'Weather information not available. Please try again later.') => {
    const box = $('weather-info');
    if (box) box.textContent = msg;
  };

  const showRecommendationContainer = () => {
    const c = document.querySelector('.recommendation-container');
    if (c) c.style.display = 'block';
  };

  const displayRecommendedCrops = (crops) => {
    const ul = $('cropList');
    if (!ul) return;
    ul.innerHTML = '';
    (crops || []).forEach(crop => {
      const li = document.createElement('li');
      li.textContent = crop;
      ul.appendChild(li);
    });
  };

  function displayWeather(data) {
    if (!data) return;
    const temperature = data?.main?.temp;
    const humidity    = data?.main?.humidity;
    const windSpeed   = data?.wind?.speed;
    const cloudCover  = data?.clouds?.all;
    const pressure    = data?.main?.pressure;

    cachedTemp = temperature ?? null;
    cachedHumidity = humidity ?? null;

    const setText = (id, text) => { const el = $(id); if (el) el.innerText = text; };
    if (temperature != null) setText('temperature', `Temperature: ${temperature} °C`);
    if (windSpeed   != null) setText('wind',        `Wind Speed: ${windSpeed} m/s`);
    if (cloudCover  != null) setText('clouds',      `Cloud Coverage: ${cloudCover} %`);
    if (pressure    != null) setText('pressure',    `Pressure: ${pressure} hPa`);

    showRecommendationContainer();

    if (typeof recommendCrops === 'function') {
      const crops = recommendCrops(temperature, humidity, windSpeed);
      displayRecommendedCrops(crops);
    }

    const N  = $('N')?.value, P = $('P')?.value, K = $('K')?.value,
          ph = $('ph')?.value, rainfall = $('rainfall')?.value;
    if (N && P && K && ph && rainfall) {
      mlRecommend({ N:+N, P:+P, K:+K, temperature, humidity, ph:+ph, rainfall:+rainfall })
        .then(renderMLResult).catch(console.error);
    }
  }

  const evalCityFetchBtn = $('evalCityFetchBtn');
  if (evalCityFetchBtn) {
    evalCityFetchBtn.addEventListener('click', async () => {
      const city = $('eval_city')?.value?.trim();
      if (!city) return alert('Enter a town/city first.');
      try {
        const w = await safeFetch(`${API_BASE}/api/weather?city=${encodeURIComponent(city)}`);
        const t = w?.main?.temp, h = w?.main?.humidity;

        const tEl = $('temperature');
        const hEl = $('humidity');
        if (tEl && 'value' in tEl) { tEl.value = t ?? ''; tEl.classList.add('just-filled'); setTimeout(()=>tEl.classList.remove('just-filled'), 800); }
        if (hEl && 'value' in hEl) { hEl.value = h ?? ''; hEl.classList.add('just-filled'); setTimeout(()=>hEl.classList.remove('just-filled'), 800); }
      } catch (e) {
        alert('Could not fetch weather for that town.');
      }
    });
  }

  // -----------------------------
  // ML endpoints (generic & stage-aware)
  // -----------------------------
  async function mlRecommend(payload) {
    return safeFetch(`${API_BASE}/api/ml-recommend`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
  }

  function renderMLResult(result) {
    const box = $('recommendationContainer');
    if (box) box.style.display = 'block';

    const msg = result?.message || 'No recommendation';
    const mlDiv = $('mlResult');
    if (mlDiv) mlDiv.innerText = msg;

    const alt = Array.isArray(result?.alternatives) ? result.alternatives : [];
    const list = $('cropList');
    if (list) {
      list.innerHTML = '';
      alt.forEach(crop => {
        const li = document.createElement('li');
        li.textContent = crop;
        list.appendChild(li);
      });
    }
  }

  const getRecBtn = $('getRecBtn');
  if (getRecBtn) {
    getRecBtn.addEventListener('click', async () => {
      try {
        const payload = {
          N: +($('N')?.value ?? NaN),
          P: +($('P')?.value ?? NaN),
          K: +($('K')?.value ?? NaN),
          ph: +($('ph')?.value ?? NaN),
          rainfall: +($('rainfall')?.value ?? NaN),
          temperature: cachedTemp ?? getNum('temperature'),
          humidity:    cachedHumidity ?? getNum('humidity')
        };
        if (Object.values(payload).some(v => Number.isNaN(v))) {
          return alert('Please fill all numeric fields (N, P, K, pH, rainfall, temperature, humidity).');
        }
        const res = await mlRecommend(payload);
        renderMLResult(res);
      } catch (e) {
        alert(e.message || 'Failed to get recommendation');
      }
    });
  }

  // -----------------------------
  // Process: Save Only
  // -----------------------------
  const cropProcessForm = $('crop_process');
  if (cropProcessForm) {
    cropProcessForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(cropProcessForm);
      const payload = {
        farmers_id: fd.get('farmers_id'),
        crop: fd.get('crop'),
        process_type: fd.get('process_type'),
        process_date: fd.get('process_date'),
        // include readings so grid can show status
        N: $('N')?.value || null,
        P: $('P')?.value || null,
        K: $('K')?.value || null,
        temperature: $('temperature')?.value || null,
        humidity: $('humidity')?.value || null,
        ph: $('ph')?.value || null,
        rainfall: $('rainfall')?.value || null
      };

      try {
        await safeFetch(`${API_BASE}/api/Evaluation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        alert('Crop process saved successfully!');
        cropProcessForm.reset();
      } catch (err) {
        alert(`Error: ${err.message}`);
      }
    });
  }

  // -----------------------------
  // Processes table (history)
  // -----------------------------
  const renderProcesses = (farmerId, processes = []) => {
    const table = document.querySelector('.process-table');
    const tbody = $('completed_processes_table')?.getElementsByTagName('tbody')?.[0];
    const idLbl = $('farmer-id-display');
    if (!table || !tbody) return;

    if (idLbl) idLbl.textContent = farmerId;
    tbody.innerHTML = '';

    if (!processes.length) {
      const row = tbody.insertRow();
      const cell = row.insertCell(0);
      cell.colSpan = 3;
      cell.textContent = 'No processes found.';
    } else {
      processes.forEach(p => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = p.crop ?? '';
        row.insertCell(1).textContent = p.process_type ?? p.processType ?? '';
        row.insertCell(2).textContent = p.process_date ?? p.processDate ?? '';
      });
    }
    table.style.display = 'table';
  };

  const showProcessBtn = $('showProcessBtn');
  if (showProcessBtn) {
    showProcessBtn.addEventListener('click', async () => {
      const farmerId = $('farmers_id')?.value?.trim();
      if (!farmerId) return alert('Please enter a valid Farmer ID.');
      try {
        const data = await safeFetch(`${API_BASE}/api/get-processes?farmers_id=${encodeURIComponent(farmerId)}`);
        renderProcesses(farmerId, data?.processes || []);
      } catch (err) {
        alert(`Unable to fetch processes: ${err.message}`);
      }
    });
  }

  // -----------------------------
  // Chat + Image upload (unchanged)
  // -----------------------------
  const sendBtn = $('sendBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      const input = $('userMessage');
      const msg = input?.value?.trim();
      const chatBody = $('chatbox-body');
      if (!msg || !chatBody) return;

      const userP = document.createElement('p');
      userP.classList.add('user-msg');
      userP.textContent = msg;
      chatBody.appendChild(userP);
      input.value = '';

      try {
        const data = await safeFetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symptoms: msg })
        });

        const botP = document.createElement('p');
        botP.classList.add('bot-msg');
        if (data?.disease) {
          botP.textContent = `Disease: ${data.disease}\nRemedies: ${Array.isArray(data.remedies) ? data.remedies.join(', ') : ''}`;
        } else {
          const ai = await safeFetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg })
          });
          botP.textContent = ai?.reply || 'AI could not generate a response.';
        }
        chatBody.appendChild(botP);
      } catch (err) {
        const botP = document.createElement('p');
        botP.classList.add('bot-msg');
        botP.textContent = `Error: ${err.message}`;
        chatBody.appendChild(botP);
      }
    });
  }

  const uploadBtn = $('uploadBtn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
      const input = $('imageInput');
      const file = input?.files?.[0];
      const chatBody = $('chatbox-body');
      if (!file || !chatBody) return alert('Select an image first.');

      const formData = new FormData();
      formData.append('cropImage', file);

      try {
        const res = await fetch(`${API_BASE}/api/upload-image`, { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));
        const botP = document.createElement('p');
        botP.classList.add('bot-msg');
        if (data?.disease) {
          botP.textContent = `Disease: ${data.disease}\nRemedies: ${Array.isArray(data.remedies) ? data.remedies.join(', ') : ''}`;
        } else {
          botP.textContent = data?.message || 'No diagnosis available.';
        }
        chatBody.appendChild(botP);
      } catch (err) {
        alert(`Upload failed: ${err.message}`);
      }
    });
  }

  // -----------------------------
  // Expert profiles toggle
  // -----------------------------
  const showExpertsBtn = $('showExpertsBtn');
  const expertProfiles = $('expertProfiles');
  if (showExpertsBtn && expertProfiles) {
    expertProfiles.style.display = 'none';
    showExpertsBtn.addEventListener('click', () => {
      expertProfiles.style.display = (expertProfiles.style.display === 'none') ? 'block' : 'none';
    });
  }

  /* ==========================================================
     NEW: Sensor vs Manual toggle, crop grid, details modal
     ========================================================== */

  // Sensor vs Manual UI
  const srcSensors = $('srcSensors');
  const srcManual  = $('srcManual');
  const toggleManualBtn = $('toggleManualBtn');
  const evalTable = $('evalTable');

  function updateSourceUI() {
    const manual = srcManual?.checked;
    if (toggleManualBtn) toggleManualBtn.style.display = manual ? 'inline-block' : 'none';
    if (!manual && evalTable) evalTable.style.display = 'none';
  }
  if (srcSensors && srcManual) {
    srcSensors.addEventListener('change', updateSourceUI);
    srcManual.addEventListener('change', updateSourceUI);
    updateSourceUI();
  }
  if (toggleManualBtn && evalTable) {
    toggleManualBtn.addEventListener('click', () => {
      evalTable.style.display = (evalTable.style.display === 'none') ? 'table' : 'none';
      toggleManualBtn.textContent = (evalTable.style.display === 'none') ? 'Show manual inputs' : 'Hide manual inputs';
    });
  }

  // Crop Grid + Detail Modal
  const cropGrid = $('cropGrid');
  const loadCropsBtn = $('loadCropsBtn');
  const cropDetailModal = $('cropDetailModal');
  const closeDetailBtn = $('closeDetailBtn');
  const detailTitle = $('detailTitle');
  const detailBody = $('detailBody');

  function normNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // Generic recommended ranges
  const REC = {
    N:  { min: 80,  max: 120 },
    P:  { min: 40,  max: 60 },
    K:  { min: 40,  max: 60 },
    ph: { min: 6.0, max: 7.0 },
    temperature: { min: 18, max: 30 },
    humidity:    { min: 50, max: 80 },
    rainfall:    { min: 50, max: 250 }
  };

  function statusOf(key, val) {
    if (val == null) return { kind:'-', label:'No data', cls:'badge' };
    const r = REC[key];
    if (!r) return { kind:'-', label:String(val), cls:'badge' };
    if (val < r.min) return { kind:'low',  label:`Low ${key}`,  cls:'badge badge-low' };
    if (val > r.max) return { kind:'high', label:`High ${key}`, cls:'badge badge-high' };
    return { kind:'ok', label:`Good ${key}`, cls:'badge badge-ok' };
  }

  function summarizeConditions(sample) {
    const keys = ['N','P','K','temperature','humidity','rainfall','ph'];
    const stats = keys.map(k => [k, statusOf(k, normNum(sample?.[k]))]);
    const firstIssue = stats.find(([,s]) => s.kind === 'low' || s.kind === 'high');
    if (firstIssue) return firstIssue[1];
    const ok = stats.find(([,s]) => s.kind === 'ok');
    return ok || { kind:'-', label:'No data', cls:'badge' };
  }

  function latestNumeric(a, b) {
    const da = new Date(a.process_date).getTime() || 0;
    const db = new Date(b.process_date).getTime() || 0;
    return db - da;
  }

  function pickLatestReading(rows) {
    const sorted = [...rows].sort(latestNumeric);
    for (const r of sorted) {
      const hasAny = ['N','P','K','temperature','humidity','ph','rainfall'].some(k => normNum(r[k]) != null);
      if (hasAny) return r;
    }
    return sorted[0] || null;
  }

  function showCropDetail(farmerId, crop, rows) {
    if (!cropDetailModal || !detailTitle || !detailBody) return;
    detailTitle.textContent = `Details • ${crop}`;
    const latest = pickLatestReading(rows) || {};
    const rowsHtml = rows
      .sort(latestNumeric)
      .map(r => `
        <tr>
          <td>${r.process_date ? new Date(r.process_date).toISOString().slice(0,10) : '-'}</td>
          <td>${r.process_type || r.processType || ''}</td>
          <td>${r.N ?? ''}</td><td>${r.P ?? ''}</td><td>${r.K ?? ''}</td>
          <td>${r.temperature ?? ''}</td><td>${r.humidity ?? ''}</td><td>${r.ph ?? ''}</td><td>${r.rainfall ?? ''}</td>
        </tr>
      `).join('');

    detailBody.innerHTML = `
      <div style="margin-bottom:10px">
        <strong>Status:</strong>
        <span class="${summarizeConditions(latest).cls}">${summarizeConditions(latest).label}</span>
      </div>
      <table class="process-table" style="width:100%">
        <thead>
          <tr>
            <th>Date</th><th>Process</th>
            <th>N</th><th>P</th><th>K</th>
            <th>Temp</th><th>Humidity</th><th>pH</th><th>Rain</th>
          </tr>
        </thead>
        <tbody>${rowsHtml || '<tr><td colspan="9">No process history.</td></tr>'}</tbody>
      </table>
    `;
    cropDetailModal.style.display = 'flex';
  }

  function renderCropGrid(farmerId, processes=[]) {
    if (!cropGrid) return;

    const byCrop = new Map();
    processes.forEach(p => {
      const key = (p.crop || '').toLowerCase().trim();
      if (!key) return;
      if (!byCrop.has(key)) byCrop.set(key, []);
      byCrop.get(key).push(p);
    });

    cropGrid.innerHTML = '';
    if (!byCrop.size) {
      cropGrid.innerHTML = '<div style="color:#555">No crops found for this farmer.</div>';
      return;
    }

    for (const [crop, rows] of byCrop) {
      const sample = pickLatestReading(rows) || {};
      const highlight = summarizeConditions(sample);

      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h4>${crop.charAt(0).toUpperCase() + crop.slice(1)}</h4>
        <div class="meta">Last update: ${sample?.process_date ? new Date(sample.process_date).toISOString().slice(0,10) : '-'}</div>
        <div style="margin:.5rem 0"><span class="${highlight.cls}">${highlight.label}</span></div>
        <div class="meta" style="display:flex;flex-wrap:wrap;gap:6px">
          <span class="${statusOf('N', normNum(sample?.N)).cls}">N</span>
          <span class="${statusOf('P', normNum(sample?.P)).cls}">P</span>
          <span class="${statusOf('K', normNum(sample?.K)).cls}">K</span>
          <span class="${statusOf('temperature', normNum(sample?.temperature)).cls}">Temp</span>
          <span class="${statusOf('humidity', normNum(sample?.humidity)).cls}">Humidity</span>
          <span class="${statusOf('rainfall', normNum(sample?.rainfall)).cls}">Rain</span>
          <span class="${statusOf('ph', normNum(sample?.ph)).cls}">pH</span>
        </div>
      `;
      card.addEventListener('click', () => showCropDetail(farmerId, crop, rows));
      cropGrid.appendChild(card);
    }
  }

  if (closeDetailBtn && cropDetailModal) {
    closeDetailBtn.addEventListener('click', () => cropDetailModal.style.display = 'none');
    cropDetailModal.addEventListener('click', (e) => { if (e.target === cropDetailModal) cropDetailModal.style.display = 'none'; });
  }

  if (loadCropsBtn) {
    loadCropsBtn.addEventListener('click', async () => {
      const farmerId = $('farmers_id')?.value?.trim();
      if (!farmerId) return alert('Enter your Farmer ID first.');
      try {
        const data = await safeFetch(`${API_BASE}/api/get-processes?farmers_id=${encodeURIComponent(farmerId)}`);
        renderCropGrid(farmerId, data?.processes || []);
      } catch (err) {
        alert(`Could not load crops: ${err.message}`);
      }
    });
  }

  // -----------------------------
  // NORMAL EVALUATION FLOW: Evaluate & Save
  // -----------------------------
  const evalBtn = $('evalBtn');

  // map process_type → stage for ML endpoint
  const stageMapEval = {
    land_prep: 'preplant',
    planting: 'planting',
    irrigation: 'vegetative',
    weed_control: 'vegetative',
    pest_management: 'vegetative',
    fertilization: 'vegetative',
    harvest: 'harvest',
    soil_management: 'preplant'
  };

  function setEvalResult(message, flagsObj = {}) {
    const card = $('evalResultCard');
    const msg = $('processMlResult');
    const warn = $('processWarnings');
    if (!card || !msg) return;

    msg.textContent = message || 'No result';
    if (warn) {
      const entries = Object.entries(flagsObj).filter(([, v]) => v !== 'ok');
      if (entries.length) {
        warn.style.display = 'block';
        warn.innerHTML = entries.map(([k, v]) => `<li>${k}: ${v}</li>`).join('');
      } else {
        warn.style.display = 'none';
        warn.innerHTML = '';
      }
    }
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (evalBtn) {
    evalBtn.addEventListener('click', async () => {
      const farmers_id = $('farmers_id')?.value?.trim();
      const crop = $('crop')?.value?.trim();
      const process_type = $('process_type')?.value;
      const process_date = $('process_date')?.value;

      // readings (from manual or sensors)
      const N = +($('N')?.value || NaN);
      const P = +($('P')?.value || NaN);
      const K = +($('K')?.value || NaN);
      const ph = +($('ph')?.value || NaN);
      const rainfall = +($('rainfall')?.value || NaN);
      const temperature = Number.isFinite(getNum('temperature')) ? getNum('temperature') : null;
      const humidity    = Number.isFinite(getNum('humidity')) ? getNum('humidity') : null;

      if (!farmers_id || !crop || !process_type || !process_date) {
        return alert('Please fill Farmer ID, crop, process type, and date.');
      }

      // For the ML endpoint, we need numeric fields:
      const mlPayload = {
        crop: String(crop).toLowerCase(),
        stage: stageMapEval[process_type] || 'vegetative',
        N, P, K,
        temperature,
        humidity,
        ph,
        rainfall
      };

      // Validate ML numeric inputs (allow some to be null, but endpoint requires all)
      const missing = Object.entries(mlPayload)
        .filter(([k, v]) => (['crop','stage'].includes(k) ? false : (v === null || Number.isNaN(v))))
        .map(([k]) => k);
      if (missing.length) {
        return alert(`Missing numeric fields for evaluation: ${missing.join(', ')}`);
      }

      try {
        // 1) Call ML stage-aware endpoint
        const evalRes = await safeFetch(`${API_BASE}/api/process-eval`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mlPayload)
        });

        // evalRes example: { prediction:'suitable'|'not suitable', suitability_score:0.82, flags:{...}, advice:'...' }
        const status = (evalRes?.prediction === 'suitable') ? 'Suitable' : 'Not suitable';
        const pct = Math.round((evalRes?.suitability_score || 0) * 100);
        let line = `${status}. Score: ${pct}%`;
        if (evalRes?.advice) line += `\nAdvice: ${evalRes.advice}`;
        setEvalResult(line, evalRes?.flags || {});

        // 2) Save process + readings + ML outputs
        const savePayload = {
          farmers_id,
          crop,
          process_type,
          process_date,
          N, P, K, ph, rainfall, temperature, humidity,
          // ML outputs:
          stage: mlPayload.stage,
          suitable: evalRes?.prediction === 'suitable',
          suitability_score: evalRes?.suitability_score ?? null,
          flags: evalRes?.flags ?? null,
          advice: evalRes?.advice ?? null
        };

        await safeFetch(`${API_BASE}/api/Evaluation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(savePayload)
        });

        alert('Evaluation saved.');
      } catch (e) {
        alert(`Evaluation failed: ${e.message}`);
      }
    });
  }
});
