// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = process.env.NODE_ENV === 'production' 
    ? 'https://your-backend-service.onrender.com'
    : 'http://localhost:3000';

  // ================================
  // AUTH: Login
  // ================================
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const farmersId = document.getElementById('farmers_id').value;
      const password = document.getElementById('password').value;

      try {
       const response = await fetch(`${API_BASE}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ farmers_id: farmersId, password })
        });

        const data = await response.json();
        if (response.ok) {
          window.location.href = "/home";
        } else {
          alert(`Login failed: ${data.message}`);
        }
      } catch (error) {
        console.error('Login failed:', error);
        alert('Server error. Please try again later.');
      }
    });
  }

  // ================================
  // AUTH: Registration
  // ================================
  const registerForm = document.getElementById('signup_form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      const farmers_id = formData.get('farmers_id');
      const fullName = formData.get('name');
      const contact = formData.get('contact');
      const land_size = formData.get('land_size');
      const soil_type = formData.get('soil_type');
      const password = formData.get('password');
      const confirmPassword = formData.get('confirm_password');

      if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            farmers_id, fullName, contact, land_size, soil_type, password, confirmPassword
          })
        });
        const data = await response.json();
        if (response.ok) {
          window.location.href = "/home";
        } else {
          alert(`Registration failed: ${data.message}`);
        }
      } catch (error) {
        console.error('Registration failed:', error);
        alert('Registration failed due to an error.');
      }
    });
  }

  // ================================
  // WEATHER + ML INTEGRATION
  // ================================
  let cachedTemp = null;
  let cachedHumidity = null;

  async function mlRecommend(payload) {
    const resp = await fetch('/api/ml-recommend', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) throw new Error((data && data.message) || 'ML error');
    return data; // { prediction, message, alternatives }
  }
  function renderMLResult(result) {
  // show the box
  const recBox = document.getElementById('recommendationContainer');
  if (recBox) recBox.style.display = 'block';

  // main message
  const msg = result?.message || 'No recommendation';
  const mlDiv = document.getElementById('mlResult');
  if (mlDiv) mlDiv.innerText = msg;

  // alternatives list (optional)
  const alt = Array.isArray(result?.alternatives) ? result.alternatives : [];
  const list = document.getElementById('cropList');
  if (list) {
    list.innerHTML = '';
    alt.forEach(crop => {
      const li = document.createElement('li');
      li.textContent = crop;
      list.appendChild(li);
    });
  }
}
  function displayErrorMessage() {
    const weatherInfo = document.getElementById('weather-info');
    if (weatherInfo) {
      weatherInfo.textContent = 'Weather information not available. Please try again later.';
    }
  }

  function showRecommendationContainer() {
    const recommendationContainer = document.querySelector('.recommendation-container');
    if (recommendationContainer) {
      recommendationContainer.style.display = 'block';
    }
  }

  // Optional: support for your previous rule-based list if present
  function displayRecommendedCrops(crops) {
    const cropList = document.getElementById('cropList');
    if (!cropList) return;
    cropList.innerHTML = '';
    (crops || []).forEach(crop => {
      const li = document.createElement('li');
      li.textContent = crop;
      cropList.appendChild(li);
    });
  }

  // Unified ML-aware displayWeather
  function displayWeather(data) {
    if (!data) return;

    const temperature = data?.main?.temp;
    const humidity = data?.main?.humidity;
    const windSpeed = data?.wind?.speed;
    const cloudCoverage = data?.clouds?.all;
    const pressure = data?.main?.pressure;

    cachedTemp = temperature;
    cachedHumidity = humidity;

    const temperatureElement = document.getElementById('temperature');
    if (temperatureElement && temperature != null) {
      temperatureElement.innerText = `Temperature: ${temperature} °C`;
    }

    const windElement = document.getElementById('wind');
    if (windElement && windSpeed != null) {
      windElement.innerText = `Wind Speed: ${windSpeed} m/s`;
    }

    const cloudsElement = document.getElementById('clouds');
    if (cloudsElement && cloudCoverage != null) {
      cloudsElement.innerText = `Cloud Coverage: ${cloudCoverage} %`;
    }

    const pressureElement = document.getElementById('pressure');
    if (pressureElement && pressure != null) {
      pressureElement.innerText = `Pressure: ${pressure} hPa`;
    }

    showRecommendationContainer();

    // Keep old rule-based list visible if you still have recommendCrops()
    if (typeof recommendCrops === 'function') {
      const crops = recommendCrops(temperature, humidity, windSpeed);
      displayRecommendedCrops(crops);
    }

    // Auto-call ML if inputs are already filled
    const N = document.getElementById('N')?.value;
    const P = document.getElementById('P')?.value;
    const K = document.getElementById('K')?.value;
    const ph = document.getElementById('ph')?.value;
    const rainfall = document.getElementById('rainfall')?.value;

    if (N && P && K && ph && rainfall) {
      mlRecommend({ N:+N, P:+P, K:+K, temperature, humidity, ph:+ph, rainfall:+rainfall })
        .then(renderMLResult)
        .catch(err => console.error(err));
    }
  }

  const apiKey = 'e303728999f9d4a7a5ced20c22f4b71e';
  const fetchWeather = async (location) => {
    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error('Weather information not available');
      }
      const weatherData = await response.json();
      console.log(weatherData);
      displayWeather(weatherData);
    } catch (error) {
      console.error('Error fetching weather:', error);
      displayErrorMessage();
    }
  };

  const fetchWeatherBtn = document.getElementById('fetchWeatherBtn');
  if (fetchWeatherBtn) {
    fetchWeatherBtn.addEventListener('click', () => {
      const locationInput = document.getElementById('location');
      if (locationInput && locationInput.value) {
        fetchWeather(locationInput.value);
      } else {
        alert('Please enter a city name.');
      }
    });
  }

  // Manual “Get ML Recommendation” button
  const getRecBtn = document.getElementById('getRecBtn');
  if (getRecBtn) {
    getRecBtn.addEventListener('click', async () => {
      try {
        const payload = {
          N: +document.getElementById('N').value,
          P: +document.getElementById('P').value,
          K: +document.getElementById('K').value,
          ph: +document.getElementById('ph').value,
          rainfall: +document.getElementById('rainfall').value,
          temperature: cachedTemp,
          humidity: cachedHumidity
        };
        const res = await mlRecommend(payload);
        renderMLResult(res);
      } catch (e) {
        alert(e.message || 'Failed to get recommendation');
      }
    });
  }

  // ================================
  // Crop process (save to backend)
  // ================================
  const cropProcessForm = document.getElementById('crop_process');
  if (cropProcessForm) {
    cropProcessForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(cropProcessForm);
      const farmers_id = formData.get('farmers_id');
      const crop = formData.get('crop');
      const process_type = formData.get('process_type');
      const process_date = formData.get('process_date');

      try {
       const response = await fetch(`${API_BASE}/api/Evaluation', {
            /register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ farmers_id, crop, process_type, process_date })
        });

        const data = await response.json();
        if (response.ok) {
          alert('Crop process saved successfully!');
        } else {
          alert(`Error: ${data.message}`);
        }
      } catch (error) {
        console.error('Error saving crop process:', error);
        alert('Error saving crop process. Please try again.');
      }
    });
  }

  // ================================
  // Feedback form
  // ================================
  const feedbackForm = document.getElementById('feedback-form');
  if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(feedbackForm);
      const status = formData.get('status');
        const response = await fetch(`${API_BASE}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      const data = await response.json();
      alert(data.message);
    });
  }

  // ================================
  // Farmer Process table helpers
  // ================================
  const farmersProcesses = {};
  function displayCompletedProcesses(farmerId) {
    const table = document.getElementById('completed_processes_table');
    if (!table) return;
    const tableBody = table.getElementsByTagName('tbody')[0];
    const farmerProcesses = farmersProcesses[farmerId] || [];
    tableBody.innerHTML = '';
    farmerProcesses.forEach(process => {
      const row = tableBody.insertRow();
      row.insertCell(0).textContent = process.crop;
      row.insertCell(1).textContent = process.processType;
      row.insertCell(2).textContent = process.processDate;
    });
    const label = document.getElementById('farmer-id-display');
    if (label) label.textContent = farmerId;
    table.style.display = 'table';
  }

  const cropProcessFormAgain = document.getElementById('crop_process');
  if (cropProcessFormAgain) {
    cropProcessFormAgain.addEventListener('submit', function(event) {
      event.preventDefault();
      const farmerId = document.getElementById('farmers_id').value;
      const crop = document.getElementById('crop').value;
      const processType = document.getElementById('process_type').value;
      const processDate = document.getElementById('process_date').value;
      if (!farmersProcesses[farmerId]) {
        farmersProcesses[farmerId] = [];
      }
      farmersProcesses[farmerId].push({ crop, processType, processDate });
    });
  }
const showProcessBtn = document.getElementById('showProcessBtn');
if (showProcessBtn) {
  showProcessBtn.addEventListener('click', function () {
    const farmerId = document.getElementById('farmers_id').value.trim();
    if (!farmerId) {
      alert('Please enter a valid Farmer ID.');
      return;
    }
    // optional: show local-in-memory rows added in this session
    displayCompletedProcesses(farmerId);

    // always fetch the real data from the backend
    displayProcesses(farmerId); // this already calls /api/get-processes
  });
}
  function displayProcesses(farmerId) {
    fetch(`/api/get-processes?farmers_id=${encodeURIComponent(farmerId)}`)
      .then(response => response.json())
      .then(data => {
        const table = document.querySelector('.process-table');
        const tableBody = document.getElementById('completed_processes_table')?.getElementsByTagName('tbody')[0];
        const farmerIdDisplay = document.getElementById('farmer-id-display');
        if (!table || !tableBody) return;
        if (farmerIdDisplay) farmerIdDisplay.textContent = farmerId;

        tableBody.innerHTML = '';
        if (!data.processes?.length) {
          const row = tableBody.insertRow();
          const cell = row.insertCell(0);
          cell.colSpan = 3;
          cell.textContent = "No processes found.";
          return;
        }
        data.processes.forEach(process => {
          const row = tableBody.insertRow();
          row.insertCell(0).textContent = process.crop;
          row.insertCell(1).textContent = process.process_type;
          row.insertCell(2).textContent = process.process_date;
        });
        table.style.display = 'table';
      })
      .catch(error => {
        console.error('Error displaying processes:', error);
        alert("An error occurred while displaying the processes.");
      });
  }

  // ================================
  // Chatbox (disease/remedy + AI fallback)
  // ================================
  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', async function () {
      const input = document.getElementById('userMessage');
      const userMessage = input?.value?.trim();
      if (!userMessage) return;

      const userMsgElement = document.createElement('p');
      userMsgElement.classList.add('user-msg');
      userMsgElement.textContent = userMessage;
      document.getElementById('chatbox-body').appendChild(userMsgElement);
      input.value = "";

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symptoms: userMessage })
        });

        const data = await response.json();

        const botResponse = document.createElement('p');
        botResponse.classList.add('bot-msg');

        if (data.disease) {
          botResponse.textContent = `Disease: ${data.disease}\nRemedies: ${data.remedies.join(', ')}`;
        } else {
          const aiResponse = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: userMessage })
          });

          const aiData = await aiResponse.json();
          botResponse.textContent = aiData.reply || 'AI could not generate a response.';
        }

        document.getElementById('chatbox-body').appendChild(botResponse);
      } catch (error) {
        console.error('Error handling chat message:', error);
        const errorMsg = document.createElement('p');
        errorMsg.classList.add('bot-msg');
        errorMsg.textContent = 'An error occurred. Please try again.';
        document.getElementById('chatbox-body').appendChild(errorMsg);
      }
    });
  }

  // ================================
  // Image upload (disease detection)
  // ================================
  const uploadBtn = document.getElementById('uploadBtn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', async function() {
      const imageInput = document.getElementById('imageInput');
      const file = imageInput?.files?.[0];
      if (!file) return alert('Select an image first');

      const formData = new FormData();
      formData.append('cropImage', file);

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      const botResponse = document.createElement('p');
      botResponse.classList.add('bot-msg');
      botResponse.textContent = `Disease: ${data.disease}\nRemedies: ${data.remedies.join(', ')}`;
      document.getElementById('chatbox-body').appendChild(botResponse);
    });
  }

  // ================================
  // Expert profiles toggle (UI)
  // ================================
  const showExpertsBtn = document.getElementById('showExpertsBtn');
  const expertProfiles = document.getElementById('expertProfiles');
  if (showExpertsBtn && expertProfiles) {
    expertProfiles.style.display = 'none';
    showExpertsBtn.addEventListener('click', () => {
      expertProfiles.style.display = (expertProfiles.style.display === 'none') ? 'block' : 'none';
    });
  }

const evalCityFetchBtn = document.getElementById('evalCityFetchBtn');
if (evalCityFetchBtn) {
  evalCityFetchBtn.addEventListener('click', async () => {
    const city = document.getElementById('eval_city')?.value?.trim();
    if (!city) return alert('Enter a town/city first.');
    try {
      const apiKey = 'e303728999f9d4a7a5ced20c22f4b71e';
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
      const r = await fetch(url);
      if (!r.ok) throw new Error('Weather lookup failed');
      const w = await r.json();
      const t = w?.main?.temp, h = w?.main?.humidity;

      // fill + highlight
      const tEl = document.getElementById('temperature');
      const hEl = document.getElementById('humidity');
      if (tEl) { tEl.value = (t ?? ''); tEl.classList.add('just-filled'); setTimeout(()=>tEl.classList.remove('just-filled'), 800); }
      if (hEl) { hEl.value = (h ?? ''); hEl.classList.add('just-filled'); setTimeout(()=>hEl.classList.remove('just-filled'), 800); }
    } catch (e) {
      console.error(e);
      alert('Could not fetch weather for that town.');
    }
  });
}

// ---------- Evaluation: call process-eval ----------
const evalBtn = document.getElementById('evalBtn');
if (evalBtn) {
  evalBtn.addEventListener('click', async () => {
    const crop = document.getElementById('crop').value.trim().toLowerCase();
    const process_type = document.getElementById('process_type').value;

    // map UI -> model stage labels
    const stageMap = {
      land_prep: 'preplant',
      planting: 'planting',
      irrigation: 'vegetative',
      weed_control: 'vegetative',
      pest_management: 'vegetative',
      fertilization: 'vegetative',
      harvest: 'harvest',
      soil_management: 'preplant'
    };
    const stage = stageMap[process_type] || 'vegetative';

    const N  = parseFloat(document.getElementById('N').value);
    const P  = parseFloat(document.getElementById('P').value);
    const K  = parseFloat(document.getElementById('K').value);
    const ph = parseFloat(document.getElementById('ph').value);

    // allow manual override, else read the inputs you filled via weather call
    const temperature = parseFloat(document.getElementById('temperature').value);
    const humidity    = parseFloat(document.getElementById('humidity').value);
    const rainfall    = parseFloat(document.getElementById('rainfall').value);

    // simple sanity
    const nums = [N,P,K,temperature,humidity,ph,rainfall];
    if (nums.some(v => Number.isNaN(v))) {
      return alert('Please fill all numeric fields (N,P,K,temperature,humidity,ph,rainfall).');
    }

    try {
      const resp = await fetch('/api/process-eval', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ crop, stage, N, P, K, temperature, humidity, ph, rainfall })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.message || 'Process evaluation failed');

      // render
      const card = document.getElementById('evalResultCard');
      const msg  = document.getElementById('processMlResult');
      const warn = document.getElementById('processWarnings');
      if (card) card.style.display = 'block';

      const status = (data.prediction === 'suitable') ? '✅ Suitable' : '⚠️ Not suitable';
      const pct = Math.round((data.suitability_score || 0) * 100);
      if (msg) msg.textContent = `${status} (score: ${pct}%)`;

      // build warnings from flags
      if (warn) {
        warn.innerHTML = '';
        const flags = data.flags || {};
        const bad = Object.entries(flags).filter(([,v]) => v !== 'ok');
        if (!bad.length) {
          warn.style.display = 'none';
        } else {
          warn.style.display = 'block';
          bad.forEach(([k,v]) => {
            const li = document.createElement('li');
            li.textContent = `${k}: ${v}`;
            li.className = (v === 'ok') ? 'status-ok' : 'status-high'; // both high/low in red class per CSS
            warn.appendChild(li);
          });
        }
      }
    } catch (e) {
      console.error(e);
      alert(e.message || 'Could not evaluate process.');
    }
  });
}
});


