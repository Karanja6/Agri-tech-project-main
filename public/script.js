// public/script.js
document.addEventListener('DOMContentLoaded', () => {
  // ---------------------------------
  // API base (no process.env)
  // ---------------------------------
  const apiOverride = document.currentScript?.dataset?.apiBase;
  const API_BASE =
    apiOverride ||
    (window.location.hostname.includes('localhost')
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
  const getVal = (id) => $(id)?.value?.trim();
  const getNum = (id) => {
    const el = $(id);
    if (!el) return NaN;
    const n = parseFloat(String(el.value ?? '').trim());
    return Number.isFinite(n) ? n : NaN;
  };
  const toISODate = (d) => {
    try { const dt = new Date(d); return Number.isNaN(dt.getTime()) ? '-' : dt.toISOString().slice(0,10); }
    catch { return '-'; }
  };

  // ---------------------------------
  // AUTH: Login
  // ---------------------------------
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

  // ---------------------------------
  // AUTH: Registration
  // ---------------------------------
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

  // ---------------------------------
  // Weather (used inside Manual Modal)
  // ---------------------------------
  const manualCityFetchBtn = $('manualCityFetchBtn');
  if (manualCityFetchBtn) {
    manualCityFetchBtn.addEventListener('click', async () => {
      const city = getVal('manual_eval_city');
      if (!city) return alert('Enter a town/city first.');
      try {
        const w = await safeFetch(`${API_BASE}/api/weather?city=${encodeURIComponent(city)}`);
        const t = w?.main?.temp, h = w?.main?.humidity;
        if (!Number.isNaN(t)) {
          $('manual_temperature').value = t ?? '';
          $('manual_temperature').classList.add('just-filled');
          setTimeout(()=>$('manual_temperature').classList.remove('just-filled'), 800);
        }
        if (!Number.isNaN(h)) {
          $('manual_humidity').value = h ?? '';
          $('manual_humidity').classList.add('just-filled');
          setTimeout(()=>$('manual_humidity').classList.remove('just-filled'), 800);
        }
      } catch {
        alert('Could not fetch weather for that town.');
      }
    });
  }

  // ---------------------------------
  // Generic recommended ranges (for status badges)
  // ---------------------------------
  const REC = {
    N:  { min: 80,  max: 120 },
    P:  { min: 40,  max: 60 },
    K:  { min: 40,  max: 60 },
    ph: { min: 6.0, max: 7.0 },
    temperature: { min: 18, max: 30 },
    humidity:    { min: 50, max: 80 },
    rainfall:    { min: 50, max: 250 }
  };
  const normNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const statusOf = (key, val) => {
    if (val == null) return { kind:'-', label:'No data', cls:'badge' };
    const r = REC[key]; if (!r) return { kind:'-', label:String(val), cls:'badge' };
    if (val < r.min) return { kind:'low',  label:`Low ${key}`,  cls:'badge badge-low' };
    if (val > r.max) return { kind:'high', label:`High ${key}`, cls:'badge badge-high' };
    return { kind:'ok', label:`Good ${key}`, cls:'badge badge-ok' };
  };
  const summarizeConditions = (sample) => {
    const keys = ['N','P','K','temperature','humidity','rainfall','ph'];
    const stats = keys.map(k => [k, statusOf(k, normNum(sample?.[k]))]);
    const issue = stats.find(([,s]) => s.kind === 'low' || s.kind === 'high');
    if (issue) return issue[1];
    const ok = stats.find(([,s]) => s.kind === 'ok');
    return ok || { kind:'-', label:'No data', cls:'badge' };
  };
  const latestFirst = (a, b) =>
    (new Date(b.process_date).getTime()||0) - (new Date(a.process_date).getTime()||0);

  // ---------------------------------
  // Data source toggle → shows/hides "Add Manual Process"
  // ---------------------------------
  const srcSensors = $('srcSensors');
  const srcManual  = $('srcManual');
  const openManualBtn = $('openManualBtn');
  function refreshManualButton() {
    if (!openManualBtn) return;
    openManualBtn.style.display = srcManual?.checked ? 'inline-block' : 'none';
  }
  if (srcSensors && srcManual) {
    srcSensors.addEventListener('change', refreshManualButton);
    srcManual.addEventListener('change', refreshManualButton);
    refreshManualButton();
  }

  // ---------------------------------
  // Crop grid + Crop Detail Modal
  // ---------------------------------
  const cropGrid = $('cropGrid');
  const loadCropsBtn = $('loadCropsBtn');
  const cropDetailModal = $('cropDetailModal');
  const closeDetailBtn = $('closeDetailBtn');
  const detailAddManualBtn = $('detailAddManualBtn');
  const detailTitle = $('detailTitle');
  const detailSnapshot = $('detailSnapshot');
  const detailCurrent = $('detailCurrent');
  const detailTbody = $('detailProcessTableBody');

  let currentFarmerId = null;
  let cachedProcesses = []; // all processes for farmer
  let currentSelectedCrop = null;

  async function fetchProcesses(farmerId) {
    const data = await safeFetch(`${API_BASE}/api/get-processes?farmers_id=${encodeURIComponent(farmerId)}`);
    cachedProcesses = data?.processes || [];
    return cachedProcesses;
  }

  function groupByCrop(rows) {
    const map = new Map();
    (rows || []).forEach(r => {
      const k = (r.crop || '').toLowerCase().trim();
      if (!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return map;
  }

  function pickLatestReading(rows) {
    const sorted = [...rows].sort(latestFirst);
    for (const r of sorted) {
      const hasAny = ['N','P','K','temperature','humidity','ph','rainfall'].some(k => normNum(r[k]) != null);
      if (hasAny) return r;
    }
    return sorted[0] || null;
  }

  function renderCropGrid(farmerId, processes = []) {
    currentFarmerId = farmerId;
    if (!cropGrid) return;
    const byCrop = groupByCrop(processes);
    cropGrid.innerHTML = '';

    if (!byCrop.size) {
      cropGrid.innerHTML = '<div class="meta">No crops found for this farmer.</div>';
      return;
    }

    for (const [crop, rows] of byCrop) {
      const sample = pickLatestReading(rows) || {};
      const highlight = summarizeConditions(sample);

      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h4>${crop.charAt(0).toUpperCase() + crop.slice(1)}</h4>
        <div class="meta">Last update: ${sample?.process_date ? toISODate(sample.process_date) : '-'}</div>
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
      card.addEventListener('click', () => openCropDetailModal(crop, rows));
      cropGrid.appendChild(card);
    }
  }

  function openCropDetailModal(crop, rows) {
    currentSelectedCrop = crop;
    if (detailTitle) {
      detailTitle.textContent = `Details • ${crop.charAt(0).toUpperCase() + crop.slice(1)}`;
    }

    // Snapshot (status based on latest readings)
    if (detailSnapshot) {
      const latest = pickLatestReading(rows) || {};
      const hi = summarizeConditions(latest);
      detailSnapshot.innerHTML = `<strong>Status:</strong> <span class="${hi.cls}">${hi.label}</span>`;
    }

    // Current (latest) process
    if (detailCurrent) {
      const sorted = [...rows].sort(latestFirst);
      const cur = sorted[0];
      if (cur) {
        const score = (cur.suitability_score != null) ? `${Math.round(cur.suitability_score * 100)}%` : '-';
        const suit = (cur.suitable == null) ? '-' : (cur.suitable ? 'Suitable' : 'Not suitable');
        detailCurrent.innerHTML = `
          <h4 style="margin:0 0 .4rem">Current Process</h4>
          <div class="meta">
            <div>Date: ${toISODate(cur.process_date)} • Type: ${cur.process_type || ''}</div>
            <div>Suitability: ${suit} • Score: ${score}</div>
            ${cur.advice ? `<div>Advice: ${cur.advice}</div>` : ''}
          </div>
        `;
      } else {
        detailCurrent.innerHTML = `<div class="meta">No current process.</div>`;
      }
    }

    // Full history table for that crop
    if (detailTbody) {
      const html = rows.sort(latestFirst).map(r => `
        <tr>
          <td>${toISODate(r.process_date)}</td>
          <td>${r.process_type || ''}</td>
          <td>${r.N ?? ''}</td><td>${r.P ?? ''}</td><td>${r.K ?? ''}</td>
          <td>${r.temperature ?? ''}</td><td>${r.humidity ?? ''}</td><td>${r.ph ?? ''}</td><td>${r.rainfall ?? ''}</td>
          <td>${r.suitable == null ? '' : (r.suitable ? 'Yes' : 'No')}</td>
          <td>${r.suitability_score == null ? '' : Math.round(r.suitability_score * 100) + '%'}</td>
        </tr>
      `).join('');
      detailTbody.innerHTML = html || `<tr><td colspan="11">No history.</td></tr>`;
    }

    if (cropDetailModal) {
      cropDetailModal.style.display = 'flex';
      cropDetailModal.setAttribute('aria-hidden','false');
    }
  }
  function closeCropDetail() {
    if (cropDetailModal) {
      cropDetailModal.style.display = 'none';
      cropDetailModal.setAttribute('aria-hidden','true');
    }
  }
  if (closeDetailBtn) closeDetailBtn.addEventListener('click', closeCropDetail);
  if (cropDetailModal) {
    cropDetailModal.addEventListener('click', (e) => { if (e.target === cropDetailModal) closeCropDetail(); });
  }

  const loadCropsBtnEl = $('loadCropsBtn');
  if (loadCropsBtnEl) {
    loadCropsBtnEl.addEventListener('click', async () => {
      const fid = getVal('farmer_id_input');
      if (!fid) return alert('Enter your Farmer ID first.');
      try {
        const rows = await fetchProcesses(fid);
        renderCropGrid(fid, rows);
      } catch (err) {
        alert(`Could not load crops: ${err.message}`);
      }
    });
  }

  // ---------------------------------
  // Manual Input Modal
  // ---------------------------------
  const manualModal = $('manualInputModal');
  const closeManualBtn = $('closeManualBtn');
  const manualForm = $('manualForm');
  const manualTitle = $('manualTitle');
  const manualResult = $('manualResult');
  const detailAddManualBtnEl = $('detailAddManualBtn');

  function openManualModal(prefill = {}) {
    if (!manualModal) return;
    if (manualTitle) manualTitle.textContent = prefill.crop ? `Add Manual Process • ${prefill.crop}` : 'Add Manual Process';
    $('manual_farmers_id').value = prefill.farmers_id ?? getVal('farmer_id_input') ?? '';
    $('manual_crop').value = prefill.crop ?? (currentSelectedCrop || '');
    $('manual_process_type').value = prefill.process_type ?? 'planting';
    $('manual_process_date').value = prefill.process_date ?? '';
    ['manual_N','manual_P','manual_K','manual_ph','manual_temperature','manual_humidity','manual_rainfall'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    $('manual_eval_city').value = '';
    if (manualResult) manualResult.textContent = '';
    manualModal.style.display = 'flex';
    manualModal.setAttribute('aria-hidden','false');
  }
  function closeManualModal() {
    if (!manualModal) return;
    manualModal.style.display = 'none';
    manualModal.setAttribute('aria-hidden','true');
  }

  const openManualBtnEl = $('openManualBtn');
  if (openManualBtnEl) {
    openManualBtnEl.addEventListener('click', () => {
      if (!srcManual?.checked) return alert('Switch to Manual to add a manual process.');
      openManualModal({});
    });
  }
  if (detailAddManualBtnEl) {
    detailAddManualBtnEl.addEventListener('click', () => {
      if (!srcManual?.checked) return alert('Switch to Manual to add a manual process.');
      openManualModal({ crop: currentSelectedCrop, farmers_id: currentFarmerId });
    });
  }
  if (closeManualBtn) closeManualBtn.addEventListener('click', closeManualModal);
  if (manualModal) {
    manualModal.addEventListener('click', (e) => { if (e.target === manualModal) closeManualModal(); });
  }

  // Stage mapping for ML
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

  async function saveProcess(payload) {
    return safeFetch(`${API_BASE}/api/Evaluation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
  async function callProcessEval(payload) {
    return safeFetch(`${API_BASE}/api/process-eval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
  function currentCropRows() {
    const crop = (currentSelectedCrop || '').toLowerCase();
    return cachedProcesses.filter(r => (r.crop||'').toLowerCase() === crop);
  }
  function refreshAfterSave() {
    const fid = getVal('manual_farmers_id') || currentFarmerId || getVal('farmer_id_input');
    if (!fid) return;
    fetchProcesses(fid).then(rows => {
      renderCropGrid(fid, rows);
      if (currentSelectedCrop) {
        const byCrop = groupByCrop(rows);
        const list = byCrop.get(currentSelectedCrop) || [];
        openCropDetailModal(currentSelectedCrop, list); // re-render fresh
      }
    }).catch(console.error);
  }

  // Manual form: Save Process Only
  if (manualForm) {
    manualForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmers_id = getVal('manual_farmers_id');
      const crop = getVal('manual_crop');
      const process_type = getVal('manual_process_type');
      const process_date = getVal('manual_process_date');
      if (!farmers_id || !crop || !process_type || !process_date) {
        return alert('Fill Farmer ID, Crop, Process Type, and Date.');
      }
      const payload = {
        farmers_id, crop, process_type, process_date,
        N: getVal('manual_N') || null,
        P: getVal('manual_P') || null,
        K: getVal('manual_K') || null,
        ph: getVal('manual_ph') || null,
        temperature: getVal('manual_temperature') || null,
        humidity: getVal('manual_humidity') || null,
        rainfall: getVal('manual_rainfall') || null
      };
      try {
        await saveProcess(payload);
        alert('Process saved.');
        closeManualModal();
        refreshAfterSave();
      } catch (err) {
        alert(`Save failed: ${err.message}`);
      }
    });
  }

  // Manual form: Evaluate & Save
  const manualEvaluateSaveBtn = $('manualEvaluateSaveBtn');
  if (manualEvaluateSaveBtn) {
    manualEvaluateSaveBtn.addEventListener('click', async () => {
      const farmers_id = getVal('manual_farmers_id');
      const crop = (getVal('manual_crop') || '').toLowerCase();
      const process_type = getVal('manual_process_type');
      const process_date = getVal('manual_process_date');
      const N = +getVal('manual_N');
      const P = +getVal('manual_P');
      const K = +getVal('manual_K');
      const ph = +getVal('manual_ph');
      const temperature = +getVal('manual_temperature');
      const humidity = +getVal('manual_humidity');
      const rainfall = +getVal('manual_rainfall');

      if (!farmers_id || !crop || !process_type || !process_date) {
        return alert('Fill Farmer ID, Crop, Process Type, and Date.');
      }

      const mlPayload = {
        crop,
        stage: stageMapEval[process_type] || 'vegetative',
        N, P, K, ph, temperature, humidity, rainfall
      };
      const missing = Object.entries(mlPayload)
        .filter(([k,v]) => (['crop','stage'].includes(k) ? false : (v == null || Number.isNaN(v))))
        .map(([k]) => k);
      if (missing.length) {
        return alert(`Missing numeric fields for evaluation: ${missing.join(', ')}`);
      }

      try {
        // 1) Evaluate via ML
        const evalRes = await callProcessEval(mlPayload);
        const status = evalRes?.prediction === 'suitable' ? 'Suitable' : 'Not suitable';
        const pct = Math.round((evalRes?.suitability_score || 0) * 100);
        const flags = evalRes?.flags || {};
        const issues = Object.entries(flags).filter(([,v]) => v !== 'ok');
        if (manualResult) {
          manualResult.textContent =
            `${status}. Score: ${pct}%` +
            (evalRes?.advice ? `\nAdvice: ${evalRes.advice}` : '') +
            (issues.length ? `\n\nIssues:\n- ${issues.map(([k,v]) => `${k}: ${v}`).join('\n- ')}` : '');
        }

        // 2) Save with ML outputs
        const savePayload = {
          farmers_id, crop, process_type, process_date,
          N, P, K, ph, temperature, humidity, rainfall,
          stage: mlPayload.stage,
          suitable: evalRes?.prediction === 'suitable',
          suitability_score: evalRes?.suitability_score ?? null,
          flags: evalRes?.flags ?? null,
          advice: evalRes?.advice ?? null
        };
        await saveProcess(savePayload);
        alert('Evaluation saved.');
        closeManualModal();
        refreshAfterSave();
      } catch (err) {
        alert(`Evaluation failed: ${err.message}`);
      }
    });
  }

  // ---------------------------------
  // Feedback (if present on page)
  // ---------------------------------
  const feedbackForm = $('feedback-form');
  if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(feedbackForm);
      const status = fd.get('status');
      try {
        const data = await safeFetch(`${API_BASE}/api/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        alert(data?.message || 'Feedback submitted.');
        feedbackForm.reset();
      } catch (err) {
        alert(`Feedback failed: ${err.message}`);
      }
    });
  }

  // ---------------------------------
  // Chat + Image upload (used on other pages)
  // ---------------------------------
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
});
