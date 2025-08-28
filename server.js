// server.js
require('dotenv').config();

const express   = require('express');
const bcrypt    = require('bcryptjs');
const Sequelize = require('sequelize');
const { DataTypes } = require('sequelize');
const cors      = require('cors');
const session   = require('express-session');
const path      = require('path'); // must be before multer uses it
const multer    = require('multer');
const upload    = multer({ dest: path.join(__dirname, 'uploads') });
const axios     = require('axios');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const app  = express();

/* =========================
   USSD + API helper config
   ========================= */
const rawBase  = process.env.API_BASE || `http://localhost:${PORT}`;
const API_BASE = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;

app.set('trust proxy', 1); // Render / proxies

// JSON for normal APIs
app.use(express.json());

// x-www-form-urlencoded ONLY for the USSD route (most gateways post like this)
app.use('/ussd', express.urlencoded({ extended: false }));

// ------------ CORS ------------
// If frontend is same-origin (served by this server on Render), CORS won’t be used.
// If you host UI elsewhere, add that origin here and keep credentials:true.
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://agri-tech-app.onrender.com'
  ],
  credentials: true
}));

// Static files (optional site)
app.use(express.static(path.join(__dirname, 'public')));

// Sessions (used by web login; USSD doesn’t need cookies)
app.use(session({
  secret: process.env.SESSION_SECRET || 'randomsetofcharacters',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',                   // true on HTTPS
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' // allow cross-site in prod
  }
}));

function ussdReply(res, type, message) {
  res.set('Content-Type', 'text/plain');
  return res.send(`${type} ${message}`);
}

async function apiPost(pathname, payload) {
  const url = `${API_BASE}${pathname}`;
  try {
    const { data } = await axios.post(url, payload);
    return data;
  } catch (e) {
    const msg = e?.response?.data?.message || e?.response?.data?.error || e.message || 'Server error';
    throw new Error(msg);
  }
}

async function apiGet(pathname, params) {
  const url = `${API_BASE}${pathname}`;
  try {
    const { data } = await axios.get(url, { params });
    return data;
  } catch (e) {
    const msg = e?.response?.data?.message || e?.response?.data?.error || e.message || 'Server error';
    throw new Error(msg);
  }
}

function rootUssdMenu() {
  return [
    'Welcome to SmartFarm',
    '1. Login',
    '2. Register',
    '3. Weather → ML Crop Advice',
    '4. Record Crop Process',
    '5. View My Processes',
    '6. Quick Disease Advice',
    '7. Feedback',
    '8. Expert Profiles',
    '9. Process Suitability Check',
  ].join('\n');
}

function fmtDate(d) {
  try {
    const dt = (d instanceof Date) ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '-';
    return dt.toISOString().slice(0, 10);
  } catch {
    return '-';
  }
}

/* ================
//  Database init
   ================ */
let sequelizeWithDB;
let User, CropProcess, Feedback;

function defineModels(sequelize) {
  const User = sequelize.define('User', {
    farmers_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false, unique: true },
    fullname:   { type: DataTypes.STRING,  allowNull: false },
    contact:    { type: DataTypes.STRING,  allowNull: false }, // keep as string for leading zeros/+ and country codes
    land_size:  { type: DataTypes.FLOAT,   allowNull: false },
    soil_type:  { type: DataTypes.STRING,  allowNull: false },
    password:   { type: DataTypes.STRING,  allowNull: false },
  }, { timestamps: true });

  const CropProcess = sequelize.define('CropProcess', {
    process_id:   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    farmers_id:   { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'farmers_id' } },
    crop:         { type: DataTypes.STRING,  allowNull: false },
    process_type: { type: DataTypes.STRING,  allowNull: false }, // e.g. planting/harvest/etc.
    process_date: { type: DataTypes.DATE,    allowNull: false },

    // Optional readings
    N:           { type: DataTypes.FLOAT, allowNull: true },
    P:           { type: DataTypes.FLOAT, allowNull: true },
    K:           { type: DataTypes.FLOAT, allowNull: true },
    temperature: { type: DataTypes.FLOAT, allowNull: true },
    humidity:    { type: DataTypes.FLOAT, allowNull: true },
    ph:          { type: DataTypes.FLOAT, allowNull: true },
    rainfall:    { type: DataTypes.FLOAT, allowNull: true },

    // ML outputs
    stage:             { type: DataTypes.STRING,  allowNull: true },
    suitable:          { type: DataTypes.BOOLEAN, allowNull: true },
    suitability_score: { type: DataTypes.FLOAT,   allowNull: true },
    flags:             { type: DataTypes.JSON,    allowNull: true },
    advice:            { type: DataTypes.TEXT,    allowNull: true },
  });

  const Feedback = sequelize.define('Feedback', {
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    farmers_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'farmers_id' } },
    date:       { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    status:     { type: DataTypes.BOOLEAN, allowNull: false },
  });

  User.hasMany(CropProcess, { foreignKey: 'farmers_id' });
  User.hasMany(Feedback,    { foreignKey: 'farmers_id' });
  CropProcess.belongsTo(User, { foreignKey: 'farmers_id' });
  Feedback.belongsTo(User,    { foreignKey: 'farmers_id' });

  return { User, CropProcess, Feedback };
}

async function initializeDatabase() {
  try {
    sequelizeWithDB = new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASSWORD,
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        dialect: process.env.DB_DIALECT || 'postgres',
        logging: false,
        // Render Postgres typically requires SSL
        dialectOptions: (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true')
          ? { ssl: { require: true, rejectUnauthorized: false } }
          : {}
      }
    );

    await sequelizeWithDB.authenticate();
    console.log('✅ Connected to PostgreSQL (ssl:',
      (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true'), ')');

    ({ User, CropProcess, Feedback } = defineModels(sequelizeWithDB));
    await sequelizeWithDB.sync({ alter: true });
    console.log('✅ Models synced');
  } catch (error) {
    console.error('❌ Unable to connect to PostgreSQL:', error);
  }
}
initializeDatabase();

// Guard so routes fail clearly if DB isn’t ready
function ensureDBReady(res) {
  if (!User || !CropProcess || !Feedback) {
    res.status(503).json({ message: 'Database not initialized yet. Please try again shortly.' });
    return false;
  }
  return true;
}

/* ======
   Routes
   ====== */

// Simple health check for your USSD provider to ping
app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/', (req, res) => {
  if (req.session.farmers_id) return res.redirect('/home');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/home', (req, res) => {
  if (!req.session.farmers_id) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.post('/api/register', async (req, res) => {
  if (!ensureDBReady(res)) return;
  const { farmers_id, fullName, contact, land_size, soil_type, password, confirmPassword } = req.body;
  if (!farmers_id || !fullName || !contact || !land_size || !soil_type || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match' });
  }
  try {
    const existingUser = await User.findOne({ where: { farmers_id } });
    if (existingUser) return res.status(400).json({ message: 'User with this ID already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({
      farmers_id,
      fullname: fullName,
      contact: String(contact),
      land_size: Number(land_size),
      soil_type,
      password: hashedPassword,
    });
    res.status(201).json({ message: 'User registered successfully', redirectTo: '/home' });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ message: 'An error occurred while registering the user' });
  }
});

app.post('/api/login', async (req, res) => {
  if (!ensureDBReady(res)) return;
  const { farmers_id, password } = req.body;
  try {
    const user = await User.findOne({ where: { farmers_id } });
    if (!user) return res.status(400).json({ message: 'Invalid farmers ID or password' });

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) return res.status(400).json({ message: 'Invalid farmers ID or password' });

    req.session.farmers_id = user.farmers_id;
    res.status(200).json({ message: 'Login successful', redirectTo: '/home' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// === Stage-aware process evaluation ===
app.post('/api/process-eval', async (req, res) => {
  const { crop, stage, N, P, K, temperature, humidity, ph, rainfall } = req.body || {};
  const required = [crop, stage, N, P, K, temperature, humidity, ph, rainfall];
  if (required.some(v => v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v)))) {
    return res.status(400).json({ message: 'Missing fields. Require: crop, stage, N,P,K,temperature,humidity,ph,rainfall' });
  }

  const pyCmd  = process.platform === 'win32' ? 'python' : 'python3';
  const pyPath = path.join(__dirname, 'ml', 'process_predict.py');
  const args   = [String(crop), String(stage), ...[N, P, K, temperature, humidity, ph, rainfall].map(String)];

  const py = spawn(pyCmd, [pyPath, ...args], { cwd: path.join(__dirname, 'ml') });

  let out = '', err = '';
  py.stdout.on('data', d => out += d.toString());
  py.stderr.on('data', d => err += d.toString());

  py.on('close', code => {
    if (code !== 0) return res.status(500).json({ message: 'ML process error', error: err || out });
    try { return res.json(JSON.parse(out.trim())); }
    catch { return res.status(500).json({ message: 'Bad ML output', raw: out }); }
  });
});

app.post('/api/feedback', async (req, res) => {
  if (!ensureDBReady(res)) return;
  try {
    const sessionFarmer = req.session?.farmers_id;
    const { farmers_id: bodyFarmer, status } = req.body || {};
    const farmers_id = bodyFarmer || sessionFarmer;
    if (!farmers_id) return res.status(400).json({ message: 'farmers_id is required for USSD/Non-session calls' });

    const statusBool = (String(status).toLowerCase() === 'true');
    const newFeedback = await Feedback.create({ farmers_id, status: statusBool });
    return res.status(201).json({ message: 'Feedback submitted successfully', feedbackId: newFeedback.id });
  } catch (error) {
    console.error('Error inserting feedback:', error);
    res.status(500).json({ message: 'Error saving feedback' });
  }
});

app.get('/api/get-processes', async (req, res) => {
  if (!ensureDBReady(res)) return;
  const { farmers_id } = req.query;
  if (!farmers_id) return res.status(400).json({ message: 'farmers_id is required' });
  try {
    const processes = await CropProcess.findAll({
      where: { farmers_id },
      order: [['process_date', 'DESC']],
    });
    res.json({ processes });
  } catch (error) {
    console.error('Error retrieving processes:', error);
    res.status(500).json({ message: 'Error retrieving processes' });
  }
});

// AI chat endpoints
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    const response = await axios.post(
      'https://api.deepinfra.com/v1/engines/deepseek-ai/DeepSeek-Prover-V2-671B/completions',
      { prompt: message, max_tokens: 100, temperature: 0.7 },
      { headers: { 'Authorization': `Bearer ${process.env.DEEPINFRA_API_KEY}`, 'Content-Type': 'application/json' } }
    );
    const reply = response.data.choices?.[0]?.text?.trim() || '';
    res.json({ reply });
  } catch (error) {
    console.error('Error contacting DeepInfra:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to get response from DeepInfra' });
  }
});

app.post('/api/diagnose-symptoms', async (req, res) => {
  const { symptoms } = req.body;
  if (!symptoms) return res.status(400).json({ error: 'Symptoms are required' });

  try {
    const prompt = `Given the following crop symptoms, provide a JSON object with the likely disease and natural remedies.
Symptoms: ${symptoms}
Format: {"disease": "...", "remedies": ["..."]}`;

    const response = await axios.post(
      'https://api.deepinfra.com/v1/engines/deepseek-ai/DeepSeek-Prover-V2-671B/completions',
      { prompt, max_tokens: 150, temperature: 0.7 },
      { headers: { 'Authorization': `Bearer ${process.env.DEEPINFRA_API_KEY}`, 'Content-Type': 'application/json' } }
    );

    const reply = response.data?.choices?.[0]?.text?.trim();
    if (!reply) return res.status(500).json({ error: 'Empty response from AI' });

    let parsed;
    try { parsed = JSON.parse(reply); }
    catch { return res.status(500).json({ error: 'Invalid JSON format in AI response', raw: reply }); }

    if (!parsed.disease || !Array.isArray(parsed.remedies)) {
      return res.status(500).json({ error: 'Malformed AI response structure.', raw: reply });
    }

    res.json(parsed);
  } catch (error) {
    console.error('Error from DeepInfra:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to analyze symptoms' });
  }
});

// GET /api/weather?city=Nairobi
app.get('/api/weather', async (req, res) => {
  const city = (req.query.city || '').trim();
  if (!city) return res.status(400).json({ message: 'city is required' });

  try {
    const url = 'https://api.openweathermap.org/data/2.5/weather';
    const { data } = await axios.get(url, {
      params: { q: city, appid: process.env.OPENWEATHER_KEY, units: 'metric' }
    });

    // Return only what the frontend needs
    return res.json({ main: data.main, wind: data.wind, clouds: data.clouds });
  } catch (e) {
    const status  = e?.response?.status || 500;
    const message = e?.response?.data?.message || 'weather fetch failed';
    return res.status(status).json({ message });
  }
});

// === ML recommend endpoint ===
app.post('/api/ml-recommend', async (req, res) => {
  const { N, P, K, temperature, humidity, ph, rainfall } = req.body || {};
  const nums = [N, P, K, temperature, humidity, ph, rainfall];
  if (nums.some(v => v === undefined || v === null || Number.isNaN(Number(v)))) {
    return res.status(400).json({ message: 'All numeric fields required: N,P,K,temperature,humidity,ph,rainfall' });
  }

  const pyCmd  = process.platform === 'win32' ? 'python' : 'python3';
  const pyPath = path.join(__dirname, 'ml', 'predict.py');
  const args   = nums.map(String);

  const py = spawn(pyCmd, [pyPath, ...args], { cwd: path.join(__dirname, 'ml') });

  let out = '', err = '';
  py.stdout.on('data', d => out += d.toString());
  py.stderr.on('data', d => err += d.toString());

  py.on('close', code => {
    if (code !== 0) return res.status(500).json({ message: 'ML service error', error: err || out });
    try { res.json(JSON.parse(out.trim())); }
    catch { res.status(500).json({ message: 'Bad ML output', raw: out }); }
  });
});

// === Simple process save (no ML) ===
// === Simple process save (now supports readings + ML fields) ===
app.post('/api/Evaluation', async (req, res) => {
  if (!ensureDBReady(res)) return;
  try {
    const {
      farmers_id, crop, process_type, process_date,
      // optional readings
      N, P, K, temperature, humidity, ph, rainfall,
      // optional ML outputs
      stage, suitable, suitability_score, flags, advice
    } = req.body || {};

    if (!farmers_id || !crop || !process_type || !process_date) {
      return res.status(400).json({ message: 'farmers_id, crop, process_type, process_date are required' });
    }

    const saved = await CropProcess.create({
      farmers_id, crop, process_type, process_date,
      // readings (nullable)
      N, P, K, temperature, humidity, ph, rainfall,
      // ML outputs (nullable)
      stage, suitable, suitability_score,
      flags, advice
    });

    return res.json({ ok: true, process_id: saved.process_id });
  } catch (e) {
    console.error('Evaluation save error:', e);
    return res.status(500).json({ message: 'Error saving process' });
  }
});
/* =========================
   Image upload (disease detection)
   ========================= */
// POST /api/upload-image  (multipart/form-data; field name: cropImage)
app.post('/api/upload-image', upload.single('cropImage'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image uploaded (field: cropImage)' });

    const imgPath = req.file.path;

    // --- OPTIONAL: Call your Python model instead ---
    const pyCmd  = process.platform === 'win32' ? 'python' : 'python3';
    const pyPath = path.join(__dirname, 'ml', 'detect_disease.py'); // implement this script
    const py     = spawn(pyCmd, [pyPath, imgPath], { cwd: path.join(__dirname, 'ml') });

    let out = '', err = '';
    py.stdout.on('data', d => out += d.toString());
    py.stderr.on('data', d => err += d.toString());
    py.on('close', code => {
      if (code !== 0) return res.status(500).json({ message: 'Image ML error', error: err || out });
      try {
        const parsed = JSON.parse(out.trim()); // expect {"disease":"..","remedies":["..",".."]}
        if (!parsed?.disease || !Array.isArray(parsed?.remedies)) {
          return res.status(500).json({ message: 'Bad ML output shape', raw: parsed });
        }
        return res.json(parsed);
      } catch {
        return res.status(500).json({ message: 'Non-JSON ML output', raw: out });
      }
    });
  } catch (e) {
    console.error('upload-image error:', e);
    return res.status(500).json({ message: 'Upload failed' });
  }
});

/* ======================
   USSD (GET for testing, POST for provider)
   ====================== */
app.all('/ussd', async (req, res) => {
  // Helpful debug (remove or reduce in production)
  console.log('[USSD HIT]', {
    method: req.method,
    body: req.body,
    query: req.query,
    'content-type': req.headers['content-type']
  });

  const isGet = req.method === 'GET';
  const sessionId   = isGet ? req.query.sessionId   : req.body.sessionId;
  const phoneNumber = isGet ? req.query.phoneNumber : req.body.phoneNumber;
  const serviceCode = isGet ? req.query.serviceCode : req.body.serviceCode;
  const textRaw     = isGet ? req.query.text        : req.body.text;

  const text  = (textRaw || '').toString();
  const parts = text.split('*').filter(Boolean);
  const first = parts[0];

  if (!parts.length) return ussdReply(res, 'CON', rootUssdMenu());

  try {
    // 1) Login -> 1*FARMER_ID*PASSWORD
    if (first === '1') {
      if (parts.length === 1) return ussdReply(res, 'CON', 'Enter Farmer ID:');
      if (parts.length === 2) return ussdReply(res, 'CON', 'Enter Password:');
      const farmers_id = parts[1];
      const password   = parts[2];
      try {
        await apiPost('/api/login', { farmers_id, password });
        return ussdReply(res, 'END', 'Login successful.');
      } catch (e) {
        return ussdReply(res, 'END', `Login failed: ${e.message}`);
      }
    }

    // 2) Register -> 2*FARMER_ID*FULL_NAME*CONTACT*LAND_SIZE*SOIL*PASSWORD
    if (first === '2') {
      const prompts = [
        'Enter Farmer ID:',
        'Enter Full Name:',
        'Enter Contact (phone):',
        'Enter Land Size (acres):',
        'Enter Soil Type:',
        'Set Password:'
      ];
      if (parts.length <= 6) return ussdReply(res, 'CON', prompts[parts.length - 1]);
      const [_, farmers_id, fullName, contact, land_size, soil_type, password] = parts;
      try {
        await apiPost('/api/register', {
          farmers_id, fullName, contact, land_size, soil_type, password, confirmPassword: password
        });
        return ussdReply(res, 'END', 'Registration successful.');
      } catch (e) {
        return ussdReply(res, 'END', `Registration failed: ${e.message}`);
      }
    }

    // 3) Weather + ML → 3*CITY*TEMP*HUMID*N*P*K*pH*RAINFALL
    if (first === '3') {
      const prompts = [
        'Enter City/Town:',
        'Enter Temperature (°C):',
        'Enter Humidity (%):',
        'Enter Nitrogen (N):',
        'Enter Phosphorus (P):',
        'Enter Potassium (K):',
        'Enter soil pH:',
        'Enter Rainfall (mm):'
      ];
      if (parts.length <= 8) return ussdReply(res, 'CON', prompts[parts.length - 1]);

      const [_, city, temperature, humidity, N, P, K, ph, rainfall] = parts;
      try {
        const ml = await apiPost('/api/ml-recommend', {
          N:+N, P:+P, K:+K, ph:+ph, rainfall:+rainfall,
          temperature:+temperature, humidity:+humidity
        });
        const list = Array.isArray(ml.alternatives) && ml.alternatives.length
          ? `\nAlternatives: ${ml.alternatives.slice(0,5).join(', ')}`
          : '';
        return ussdReply(res, 'END', `${ml.message || 'Recommendation ready.'}${list}`);
      } catch (e) {
        return ussdReply(res, 'END', `Could not get recommendation: ${e.message}`);
      }
    }

    // 4) Record Crop Process -> 4*FARMER_ID*CROP*PROCESS_TYPE*DATE
    if (first === '4') {
      const prompts = [
        'Enter Farmer ID:',
        'Enter Crop (e.g., maize):',
        'Process Type (land_prep/planting/irrigation/weed_control/pest_management/fertilization/harvest/soil_management):',
        'Enter Process Date (YYYY-MM-DD):'
      ];
      if (parts.length <= 4) return ussdReply(res, 'CON', prompts[parts.length - 1]);

      const [_, farmers_id, crop, process_type, process_date] = parts;
      try {
        await apiPost('/api/Evaluation', { farmers_id, crop, process_type, process_date });
        return ussdReply(res, 'END', 'Process saved.');
      } catch (e) {
        return ussdReply(res, 'END', `Save failed: ${e.message}`);
      }
    }

    // 5) View My Processes -> 5*FARMER_ID
    if (first === '5') {
      if (parts.length === 1) return ussdReply(res, 'CON', 'Enter Farmer ID:');
      const farmers_id = parts[1];
      try {
        const data = await apiGet('/api/get-processes', { farmers_id });
        const rows = (data.processes || []).slice(0, 5)
          .map(p => `${fmtDate(p.process_date)} • ${p.crop} • ${p.process_type}`);
        if (!rows.length) return ussdReply(res, 'END', 'No processes found.');
        return ussdReply(res, 'END', rows.join('\n'));
      } catch (e) {
        return ussdReply(res, 'END', `Lookup failed: ${e.message}`);
      }
    }

    // 6) Quick Disease Advice -> 6*symptoms text...
    if (first === '6') {
      if (parts.length === 1) return ussdReply(res, 'CON', 'Describe crop symptoms (short):');
      const symptoms = parts.slice(1).join(' ');
      try {
        const data = await apiPost('/api/diagnose-symptoms', { symptoms });
        const remedies = Array.isArray(data.remedies) ? data.remedies.join(', ') : '-';
        return ussdReply(res, 'END', `Disease: ${data.disease}\nRemedies: ${remedies}`);
      } catch (e) {
        return ussdReply(res, 'END', `Error: ${e.message}`);
      }
    }

    // 7) Feedback -> 7*FARMER_ID*your feedback (we store boolean only)
    if (first === '7') {
      if (parts.length === 1) return ussdReply(res, 'CON', 'Enter Farmer ID:');
      if (parts.length === 2) return ussdReply(res, 'CON', 'Share your feedback (short):');
      const farmers_id = parts[1];
      try {
        const r = await apiPost('/api/feedback', { farmers_id, status: 'true' });
        return ussdReply(res, 'END', r.message || 'Thanks for your feedback.');
      } catch (e) {
        return ussdReply(res, 'END', `Could not save feedback: ${e.message}`);
      }
    }

    // 8) Expert Profiles (static)
    if (first === '8') {
      const experts = [
        'Agro Hotline: 0700 000 000',
        'Soil Lab: 0711 111 111',
        'County Ext: 0722 222 222'
      ].join('\n');
      return ussdReply(res, 'END', experts);
    }

    // 9) Process Suitability Check -> 9*CROP*PROCESS_TYPE*N*P*K*TEMP*HUMID*PH*RAINFALL
    if (first === '9') {
      const prompts = [
        'Crop (e.g., maize):',
        'Process Type (land_prep/planting/irrigation/weed_control/pest_management/fertilization/harvest/soil_management):',
        'Nitrogen (N):',
        'Phosphorus (P):',
        'Potassium (K):',
        'Temperature (°C):',
        'Humidity (%):',
        'Soil pH:',
        'Rainfall (mm):'
      ];
      if (parts.length <= 9) return ussdReply(res, 'CON', prompts[parts.length - 1]);

      const [_, crop, process_type, N, P, K, temperature, humidity, ph, rainfall] = parts;
      const stageMapEval = {
        land_prep: 'preplant',
        planting: 'planting',
        irrigation: 'vegetative',
        weed_control: 'vegetative',
        pest_management: 'vegetative',
        fertilization: 'vegetative',
        harvest: 'harvest',
        soil_management: 'preplant',
      };
      const stage = stageMapEval[process_type] || 'vegetative';

      try {
        const data = await apiPost('/api/process-eval', {
          crop: String(crop).toLowerCase(),
          stage,
          N:+N, P:+P, K:+K,
          temperature:+temperature,
          humidity:+humidity,
          ph:+ph,
          rainfall:+rainfall
        });
        const status = (data.prediction === 'suitable') ? 'Suitable' : 'Not suitable';
        const pct = Math.round((data.suitability_score || 0) * 100);
        let msg = `${status}. Score: ${pct}%`;
        const flags = data.flags || {};
        const issues = Object.entries(flags).filter(([,v]) => v !== 'ok');
        if (issues.length) {
          msg += '\nIssues:';
          issues.slice(0, 3).forEach(([k, v]) => { msg += `\n- ${k}: ${v}`; });
        }
        return ussdReply(res, 'END', msg);
      } catch (e) {
        return ussdReply(res, 'END', `Check failed: ${e.message}`);
      }
    }

    // Fallback to root menu
    return ussdReply(res, 'CON', rootUssdMenu());
  } catch (err) {
    console.error('USSD error:', err);
    return ussdReply(res, 'END', 'An error occurred. Try again later.');
  }
});

/* =========
   Listener
   ========= */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API_BASE: ${API_BASE}`);
  console.log('DB host:', process.env.DB_HOST, 'ssl:', (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true'));
}).on('error', (err) => {
  console.error('Server failed to start:', err);
});
