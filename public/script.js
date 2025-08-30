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

    // ---------------------------------
    // Tiny helpers
    // ---------------------------------
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
    const toISODate = (d) => {
        try { const dt = new Date(d); return Number.isNaN(dt.getTime()) ? '-' : dt.toISOString().slice(0, 10); }
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
            const password = $('password')?.value;
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
    // WEATHER (main button + manual modal)
    // ---------------------------------
  async function loadForecast() {
    const cityInput = document.getElementById("location"); 
    const city = cityInput.value.trim();
    const weatherInfo = document.getElementById("weather-info");
    const tempChartDiv = document.getElementById("tempChart");
    const rainChartDiv = document.getElementById("rainChart");

    if (!city) {
      weatherInfo.textContent = "Please enter a city name";
      return;
    }

    weatherInfo.textContent = "Fetching weather forecast...";
    tempChartDiv.style.display = "block";
    rainChartDiv.style.display = "block";

    try {
      const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
      const data = await res.json();

      if (data.error) {
        weatherInfo.textContent = `Error: ${data.error}`;
        return;
      }

      const { time: dates, temperature_2m_max: maxTemps, temperature_2m_min: minTemps, precipitation_sum: rain } = data;

      weatherInfo.textContent = "";

      Highcharts.chart("tempChart", {
        chart: { type: "line" },
        title: { text: `16-Day Temperature Forecast for ${city}` },
        xAxis: { categories: dates },
        yAxis: { title: { text: "Temperature (°C)" } },
        series: [
          { name: "Max Temp", data: maxTemps },
          { name: "Min Temp", data: minTemps }
        ]
      });

      Highcharts.chart("rainChart", {
        chart: { type: "column" },
        title: { text: `16-Day Precipitation Forecast for ${city}` },
        xAxis: { categories: dates },
        yAxis: { title: { text: "Rainfall (mm)" } },
        series: [{ name: "Precipitation", data: rain }]
      });

    } catch (err) {
      console.error(err);
      weatherInfo.textContent = "Failed to fetch forecast";
    }
}


document.addEventListener("DOMContentLoaded", () => {
  const fetchWeatherBtn = document.getElementById("fetchWeatherBtn");
  if (fetchWeatherBtn) {
    fetchWeatherBtn.addEventListener("click", loadForecast);
  }

  
  const getRecBtn = document.getElementById("getRecBtn");
  if (getRecBtn) {
    getRecBtn.addEventListener("click", getRecommendations);
  }
});
    
    // ---------------------------------
    // Manual modal: “Use City Weather”
    // ---------------------------------
    const manualCityFetchBtn = $('manualCityFetchBtn');
    if (manualCityFetchBtn) {
        manualCityFetchBtn.addEventListener('click', async () => {
            const city = getVal('manual_eval_city');
            if (!city) return alert('Enter a town/city first.');
            try {
                // This will still work for the manual modal
                const url = `${API_BASE}/api/weather?city=${encodeURIComponent(city)}`;
                const data = await safeFetch(url);

                if (!data.daily) {
                    throw new Error("API response is missing daily weather data.");
                }

                const t = data.daily.temperature_2m_max?.[0];
                const h = data.daily.relative_humidity_2m?.[0];
                const wind = data.daily.wind_speed_10m?.[0];
                const pressure = data.daily.surface_pressure?.[0];

                // Fill modal inputs
                const fillIfInput = (id, val) => {
                    const el = $(id);
                    if (el && 'value' in el) {
                        el.value = (val ?? '');
                    }
                };

                fillIfInput('manual_temperature', t);
                fillIfInput('manual_humidity', h);
                fillIfInput('manual_wind', wind);
                fillIfInput('manual_pressure', pressure);

                alert('Weather data fetched and filled.');

            } catch (err) {
                alert(`Weather failed: ${err.message}`);
            }
        });
    }
    
    // ---------------------------------
    // Status ranges and helpers for grid
    // ---------------------------------
    const REC = {
        N: { min: 80, max: 120 },
        P: { min: 40, max: 60 },
        K: { min: 40, max: 60 },
        ph: { min: 6.0, max: 7.0 },
        temperature: { min: 18, max: 30 },
        humidity: { min: 50, max: 80 },
        rainfall: { min: 50, max: 250 }
    };
    const normNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
    const statusOf = (key, val) => {
        if (val == null) return { kind: '-', label: 'No data', cls: 'badge' };
        const r = REC[key]; if (!r) return { kind: '-', label: String(val), cls: 'badge' };
        if (val < r.min) return { kind: 'low', label: `Low ${key}`, cls: 'badge badge-low' };
        if (val > r.max) return { kind: 'high', label: `High ${key}`, cls: 'badge badge-high' };
        return { kind: 'ok', label: `Good ${key}`, cls: 'badge badge-ok' };
    };
    const summarizeConditions = (sample) => {
        const keys = ['N', 'P', 'K', 'temperature', 'humidity', 'rainfall', 'ph'];
        const stats = keys.map(k => [k, statusOf(k, normNum(sample?.[k]))]);
        const issue = stats.find(([, s]) => s.kind === 'low' || s.kind === 'high');
        if (issue) return issue[1];
        const ok = stats.find(([, s]) => s.kind === 'ok');
        return ok || { kind: '-', label: 'No data', cls: 'badge' };
    };
    const latestFirst = (a, b) =>
        (new Date(b.process_date).getTime() || 0) - (new Date(a.process_date).getTime() || 0);

    // --- NEW: Current-season helper (from last planting to next harvest/today) ---
    function getCurrentSeasonRows(rows) {
        if (!Array.isArray(rows) || !rows.length) return [];

        const sorted = [...rows].sort(latestFirst);

        // Most recent planting
        const lastPlanting = sorted.find(r => (r.process_type || '').toLowerCase() === 'planting');
        if (!lastPlanting) {
            // Fallback: last 90 days (or last 10 rows)
            const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            const byDate = sorted.filter(r => new Date(r.process_date) >= ninetyDaysAgo);
            return byDate.length ? byDate : sorted.slice(0, 10);
        }

        const plantingDate = new Date(lastPlanting.process_date);

        // First harvest after that planting
        const nextHarvest = sorted.find(r => {
            const t = (r.process_type || '').toLowerCase();
            return t === 'harvest' && new Date(r.process_date) >= plantingDate;
        });
        const endDate = nextHarvest ? new Date(nextHarvest.process_date) : new Date();

        // Keep rows within [plantingDate, endDate]
        return sorted.filter(r => {
            const d = new Date(r.process_date);
            return d >= plantingDate && d <= endDate;
        });
    }

    // ---------------------------------
    // Data source toggle → show/hide "Add Manual Process"
    // ---------------------------------
    const srcSensors = $('srcSensors');
    const srcManual = $('srcManual');
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
            const hasAny = ['N', 'P', 'K', 'temperature', 'humidity', 'ph', 'rainfall'].some(k => normNum(r[k]) != null);
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

        // NEW: use only current season rows in the popup
        const seasonRows = getCurrentSeasonRows(rows);

        // Snapshot (status based on latest season readings)
        if (detailSnapshot) {
            const latest = pickLatestReading(seasonRows) || {};
            const hi = summarizeConditions(latest);
            detailSnapshot.innerHTML = `<strong>Status (this season):</strong> <span class="${hi.cls}">${hi.label}</span>`;
        }

        // Current (latest) process in this season
        if (detailCurrent) {
            const sorted = [...seasonRows].sort(latestFirst);
            const cur = sorted[0];
            if (cur) {
                const score = (cur.suitability_score != null) ? `${Math.round(cur.suitability_score * 100)}%` : '-';
                const suit = (cur.suitable == null) ? '-' : (cur.suitable ? 'Suitable' : 'Not suitable');
                detailCurrent.innerHTML = `
                    <h4 style="margin:0 0 .4rem">Current Process (this season)</h4>
                    <div class="meta">
                        <div>Date: ${toISODate(cur.process_date)} • Type: ${cur.process_type || ''}</div>
                        <div>Suitability: ${suit} • Score: ${score}</div>
                        ${cur.advice ? `<div>Advice: ${cur.advice}</div>` : ''}
                    </div>
                `;
            } else {
                detailCurrent.innerHTML = `<div class="meta">No current process this season.</div>`;
            }
        }

        // Season history table
        if (detailTbody) {
            const html = seasonRows.sort(latestFirst).map(r => `
                <tr>
                    <td>${toISODate(r.process_date)}</td>
                    <td>${r.process_type || ''}</td>
                    <td>${r.N ?? ''}</td><td>${r.P ?? ''}</td><td>${r.K ?? ''}</td>
                    <td>${r.temperature ?? ''}</td><td>${r.humidity ?? ''}</td><td>${r.ph ?? ''}</td><td>${r.rainfall ?? ''}</td>
                    <td>${r.suitable == null ? '' : (r.suitable ? 'Yes' : 'No')}</td>
                    <td>${r.suitability_score == null ? '' : Math.round(r.suitability_score * 100) + '%'}</td>
                </tr>
            `).join('');
            detailTbody.innerHTML = html || `<tr><td colspan="11">No records for the current season.</td></tr>`;
        }

        // Show the modal
        if (cropDetailModal) {
            cropDetailModal.style.display = 'flex';
            cropDetailModal.setAttribute('aria-hidden', 'false');
        }

        // NEW: "Show Full Processes" → navigate to full page with all history
        const showAllBtn = $('detailShowAllBtn');
        if (showAllBtn) {
            const fid = currentFarmerId || getVal('farmer_id_input');
            showAllBtn.onclick = () => {
                if (!fid) return alert('Missing Farmer ID.');
                const url = `/crop-details.html?farmer_id=${encodeURIComponent(fid)}&crop=${encodeURIComponent(crop)}`;
                window.location.href = url;
            };
        }
    }

    function closeCropDetail() {
        if (cropDetailModal) {
            cropDetailModal.style.display = 'none';
            cropDetailModal.setAttribute('aria-hidden', 'true');
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
        $('manual_farmers_id').value = prefill.farmers_id ?? currentFarmerId ?? getVal('farmer_id_input') ?? '';
        $('manual_crop').value = prefill.crop ?? (currentSelectedCrop || '');
        $('manual_process_type').value = prefill.process_type ?? 'planting';
        $('manual_process_date').value = prefill.process_date ?? '';
        ['manual_N', 'manual_P', 'manual_K', 'manual_ph', 'manual_temperature', 'manual_humidity', 'manual_rainfall'].forEach(id => { const el = $(id); if (el) el.value = ''; });
        $('manual_eval_city').value = '';
        if (manualResult) manualResult.textContent = '';
        manualModal.style.display = 'flex';
        manualModal.setAttribute('aria-hidden', 'false');
    }
    function closeManualModal() {
        if (!manualModal) return;
        manualModal.style.display = 'none';
        manualModal.setAttribute('aria-hidden', 'true');
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

    // ---------------------------------
    // Evaluate & Save (Manual Modal)
    // ---------------------------------
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
    function groupByCropFromCache(crop) {
        const byCrop = groupByCrop(cachedProcesses);
        return byCrop.get(crop) || [];
    }
    function refreshAfterSave() {
        const fid = getVal('manual_farmers_id') || currentFarmerId || getVal('farmer_id_input');
        if (!fid) return;
        fetchProcesses(fid).then(rows => {
            renderCropGrid(fid, rows);
            if (currentSelectedCrop) {
                const byCrop = groupByCrop(rows);
                const list = byCrop.get(currentSelectedCrop) || [];
                openCropDetailModal(currentSelectedCrop, list); // re-render fresh (season view)
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
                .filter(([k, v]) => (['crop', 'stage'].includes(k) ? false : (v == null || Number.isNaN(v))))
                .map(([k]) => k);
            if (missing.length) return alert(`Missing numeric fields for evaluation: ${missing.join(', ')}`);

            try {
                // 1) Evaluate via ML
                const evalRes = await callProcessEval(mlPayload);
                const status = evalRes?.prediction === 'suitable' ? 'Suitable' : 'Not suitable';
                const pct = Math.round((evalRes?.suitability_score || 0) * 100);
                const flags = evalRes?.flags || {};
                const issues = Object.entries(flags).filter(([, v]) => v !== 'ok');
                if (manualResult) {
                    manualResult.textContent =
                        `${status}. Score: ${pct}%` +
                        (evalRes?.advice ? `\nAdvice: ${evalRes.advice}` : '') +
                        (issues.length ? `\n\nIssues:\n- ${issues.map(([k, v]) => `${k}: ${v}`).join('\n- ')}` : '');
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
    // AI Crop Recommendations
    // ---------------------------------
    let currentConversationId = null;

    // Get recommendation button handler
    const getRecBtn = $('getRecBtn');
    if (getRecBtn) {
        getRecBtn.addEventListener('click', async () => {
            const N = getVal('N');
            const P = getVal('P');
            const K = getVal('K');
            const ph = getVal('ph');
            const temperature = getVal('temperature');
            const humidity = getVal('humidity');
            const rainfall = getVal('rainfall');

            // Validate required inputs
            if (!N || !P || !K || !rainfall) {
                return alert('Please fill in at least Nitrogen (N), Phosphorus (P), Potassium (K), and Rainfall values.');
            }

            // Show recommendation container
            const container = $('recommendationContainer');
            if (container) {
                container.style.display = 'block';
                container.scrollIntoView({ behavior: 'smooth' });
            }

            // Clear previous results
            clearRecommendationResults();

            // Show loading indicators
            showLoadingIndicators();

            // Prepare input data with defaults for ML endpoint
            const inputData = {
                N: parseFloat(N),
                P: parseFloat(P),
                K: parseFloat(K),
                ph: ph ? parseFloat(ph) : 6.5, // Default neutral pH
                temperature: temperature ? parseFloat(temperature) : 25, // Default 25°C
                humidity: humidity ? parseFloat(humidity) : 65, // Default 65%
                rainfall: parseFloat(rainfall)
            };

            // Call both ML and AI endpoints in parallel
            const [mlResult, aiResult] = await Promise.allSettled([
                callMLRecommendation(inputData),
                callAIRecommendation(inputData)
            ]);

            // Hide loading indicators
            hideLoadingIndicators();

            // Display ML results
            if (mlResult.status === 'fulfilled') {
                displayMLResult(mlResult.value);
            } else {
                displayMLError(mlResult.reason);
            }

            // Display AI results
            if (aiResult.status === 'fulfilled') {
                displayAIResult(aiResult.value);
                currentConversationId = aiResult.value?.conversationId;
                showFollowUpSection();
            } else {
                displayAIError(aiResult.reason);
            }

            // Show comparison if both succeeded
            if (mlResult.status === 'fulfilled' && aiResult.status === 'fulfilled') {
                displayComparison(mlResult.value, aiResult.value);
            }
        });
    }

    // ML recommendation API call
    async function callMLRecommendation(inputData) {
        return safeFetch(`${API_BASE}/api/ml-recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inputData)
        });
    }

    // AI recommendation API call
    async function callAIRecommendation(inputData) {
        return safeFetch(`${API_BASE}/api/ai-crop-recommendation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inputData)
        });
    }

    // UI helper functions
    function clearRecommendationResults() {
        const mlResult = $('mlResult');
        const aiResult = $('aiResult');
        const comparisonResult = $('comparisonResult');
        const conversationHistory = $('conversationHistory');

        if (mlResult) mlResult.innerHTML = '';
        if (aiResult) aiResult.innerHTML = '';
        if (comparisonResult) comparisonResult.innerHTML = '';
        if (conversationHistory) conversationHistory.innerHTML = '';

        // Hide sections
        const comparisonSection = $('comparisonSection');
        const followUpSection = $('followUpSection');
        const aiError = $('aiError');

        if (comparisonSection) comparisonSection.style.display = 'none';
        if (followUpSection) followUpSection.style.display = 'none';
        if (aiError) aiError.style.display = 'none';
    }

    function showLoadingIndicators() {
        const mlLoading = $('mlLoading');
        const aiLoading = $('aiLoading');

        if (mlLoading) mlLoading.style.display = 'flex';
        if (aiLoading) aiLoading.style.display = 'flex';
    }

    function hideLoadingIndicators() {
        const mlLoading = $('mlLoading');
        const aiLoading = $('aiLoading');

        if (mlLoading) mlLoading.style.display = 'none';
        if (aiLoading) aiLoading.style.display = 'none';
    }

    function displayMLResult(data) {
        const mlResult = $('mlResult');
        if (!mlResult) return;

        if (data?.prediction) {
            mlResult.innerHTML = `
                <div class="ml-prediction">
                    <h4>Recommended Crop: ${data.prediction}</h4>
                    ${data.confidence ? `<p>Confidence: ${Math.round(data.confidence * 100)}%</p>` : ''}
                    ${data.suitability_score ? `<p>Suitability Score: ${Math.round(data.suitability_score * 100)}%</p>` : ''}
                </div>
            `;
        } else {
            mlResult.innerHTML = '<p>No ML recommendation available.</p>';
        }
    }

    function displayAIResult(fullServerResponse) { // Renamed parameter for clarity
        const aiResult = $('aiResult');
        if (!aiResult) {
            console.warn("Element with ID 'aiResult' not found in the DOM.");
            return;
        }

        // Access the aiRecommendation object from the full server response
        const aiRecommendationData = fullServerResponse?.aiRecommendation;

        if (aiRecommendationData?.care_guide) {
            aiResult.innerHTML = `
                <div class="ai-care-guide">
                    <h4>Comprehensive Crop Care Guide</h4>
                    <p>${aiRecommendationData.care_guide.replace(/\n/g, '<br>')}</p>
                </div>
            `;
            // Ensure the AI result section is visible
            const aiSection = document.getElementById('aiRecommendationSection'); // Assuming an ID for the parent section
            if (aiSection) aiSection.style.display = 'block';

        } else if (aiRecommendationData?.error) {
            aiResult.innerHTML = `<p class="error">AI care guide unavailable: ${aiRecommendationData.error}</p>`;
            const aiErrorDiv = $('aiError');
            if (aiErrorDiv) {
                aiErrorDiv.style.display = 'block';
                aiErrorDiv.innerHTML = `<p>AI recommendations unavailable: ${aiRecommendationData.error}</p>`;
            }
        } else {
            aiResult.innerHTML = '<p>No AI care guide available.</p>';
        }
    }


    function displayMLError(error) {
        const mlResult = $('mlResult');
        if (!mlResult) return;
        mlResult.innerHTML = `<p class="error">ML recommendation failed: ${error.message || 'Unknown error'}</p>`;
    }

    function displayAIError(error) {
        const aiError = $('aiError');
        if (aiError) {
            aiError.style.display = 'block';
            aiError.innerHTML = `<p>AI recommendations unavailable: ${error.message || 'Service temporarily unavailable'}</p>`;
        }
    }

    function displayComparison(mlData, aiData) {
        const comparisonResult = $('comparisonResult');
        const comparisonSection = $('comparisonSection');

        if (!comparisonResult || !comparisonSection) return;

        const mlCrop = mlData?.prediction?.toLowerCase();
        const aiCrop = aiData?.recommendation?.primaryCrop?.toLowerCase();

        let comparisonHtml = '';

        if (mlCrop && aiCrop) {
            if (mlCrop === aiCrop) {
                comparisonHtml = `<p class="agreement">✓ Both ML and AI recommend: <strong>${mlData.prediction}</strong></p>`;
            } else {
                comparisonHtml = `
                    <p class="difference">⚠ Different recommendations:</p>
                    <ul>
                        <li>ML Model suggests: <strong>${mlData.prediction}</strong></li>
                        <li>AI Analysis suggests: <strong>${aiData.recommendation.primaryCrop}</strong></li>
                    </ul>
                    <p><em>Consider both options and your specific farming conditions.</em></p>
                `;
            }
        }

        comparisonResult.innerHTML = comparisonHtml;
        comparisonSection.style.display = 'block';
    }

    function showFollowUpSection() {
        const followUpSection = $('followUpSection');
        if (followUpSection) {
            followUpSection.style.display = 'block';
        }
    }

    // Follow-up questions handler
    const askQuestionBtn = $('askQuestionBtn');
    if (askQuestionBtn) {
        askQuestionBtn.addEventListener('click', async () => {
            const questionInput = $('followUpQuestion');
            const question = questionInput?.value?.trim();

            if (!question) {
                return alert('Please enter a question.');
            }

            if (!currentConversationId) {
                return alert('No active conversation. Please get a recommendation first.');
            }

            // Disable button and show loading
            askQuestionBtn.disabled = true;
            askQuestionBtn.textContent = 'Asking...';

            // Add user question to conversation history
            addToConversationHistory(question, 'user');

            // Clear input
            questionInput.value = '';

            try {
                const response = await safeFetch(`${API_BASE}/api/ai-conversation`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: currentConversationId,
                        message: question
                    })
                });

                // Add AI response to conversation history
                addToConversationHistory(response.reply, 'ai');

            } catch (err) {
                alert(`Failed to get response: ${err.message}`);
                addToConversationHistory('Sorry, I could not get a response.', 'ai');
            } finally {
                // Re-enable button
                askQuestionBtn.disabled = false;
                askQuestionBtn.textContent = 'Ask';
            }
        });
    }

    function addToConversationHistory(message, sender) {
        const conversationHistory = $('conversationHistory');
        if (!conversationHistory) return;

        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);
        messageElement.innerHTML = `<p>${message.replace(/\n/g, '<br>')}</p>`;

        conversationHistory.appendChild(messageElement);
        conversationHistory.scrollTop = conversationHistory.scrollHeight; // Auto-scroll to bottom
    }

});
