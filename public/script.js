// public/script.js
document.addEventListener('DOMContentLoaded', () => {
  // -----------------------------
  // API base (no process.env)
  // -----------------------------
  // Optional HTML override: <script src="/script.js" data-api-base="https://your-api.onrender.com"></script>
  const apiOverride = document.currentScript?.dataset?.apiBase;
  const API_BASE = apiOverride
    || (window.location.hostname.includes('localhost')
        ? 'http://localhost:3000'
        : window.location.origin); // same-origin in Render when frontend is served by Express

  const $ = (id) => document.getElementById(id);

  const safeJson = async (res) => { try { return await res.json(); } catch { return {}; } };

  const safeFetch = async (url, opts = {}) => {
    try {
      const res = await fetch(url, opts);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
      return data;
    } catch (err) {
      console.error('Fetch error:', err);
      throw err;
    }
  };

  // Reads a number from an <input> (value) or a text element (textContent)
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

    // If soil inputs already filled, auto-call ML
    const N  = $('N')?.value, P = $('P')?.value, K = $('K')?.value,
          ph = $('ph')?.value, rainfall = $('rainfall')?.value;
    if (N && P && K && ph && rainfall) {
      mlRecommend({ N:+N, P:+P, K:+K, temperature, humidity, ph:+ph, rainfall:+rainfall })
        .then(renderMLResult).catch(console.error);
    }
  }

  const fetchWeatherBtn = $('fetchWeatherBtn');
  if (fetchWeatherBtn) {
    fetchWeatherBtn.addEventListener('click', async () => {
      const city = $('location')?.value?.trim();
      if (!city) return alert('Please enter a city name.');
      try {
        const data = await safeFetch(`${API_BASE}/api/weather?city=${encodeURIComponent(city)}`);
        displayWeather(data);
      } catch (err) {
        displayWeatherError(err.message);
      }
    });
  }

  // Fill evaluation inputs from city (still proxied)
  const evalCityFetchBtn = $('evalCityFetchBtn');
  if (evalCityFetchBtn) {
    evalCityFetchBtn.addEventListener('click', async () => {
      const city = $('eval_city')?.value?.trim();
      if (!city) return alert('Enter a town/city first.');
      try {
        const w = await safeFetch(`${API_BASE}/api/weather?city=${encodeURIComponent(city)}`);
        const t = w?.main?.temp, h = w?.main?.humidity;

        const tEl = $('temperature'); // supports input or text span
        const hEl = $('humidity');
        if (tEl && 'value' in tEl) { tEl.value = t ?? ''; tEl.classList.add('just-filled'); setTimeout(()=>tEl.classList.remove('just-filled'), 800); }
        if (hEl && 'value' in hEl) { hEl.value = h ?? ''; hEl.classList.add('just-filled'); setTimeout(()=>hEl.classList.remove('just-filled'), 800); }
      } catch (e) {
        alert('Could not fetch weather for that town.');
      }
    });
  }

  // -----------------------------
  // ML endpoints
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
  // Crop process (save to backend)
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
        process_date: fd.get('process_date')
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
  // Feedback form
  // -----------------------------
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

  // -----------------------------
  // Processes table
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
  // Chat (text → disease or AI reply)
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
          // fallback: general AI chat
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

  // -----------------------------
  // Image upload (disease detection)
  // -----------------------------
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
});
