// server.js - Updated
require('dotenv').config();

const express = require('express');
const bcrypt = require('bcryptjs');
const Sequelize = require('sequelize');
const { DataTypes } = require('sequelize');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: path.join(__dirname, 'uploads') });
const axios = require('axios');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const app = express();

/* =========================
   USSD + API helper config
   ========================= */
const rawBase = process.env.API_BASE || `http://localhost:${PORT}`;
const API_BASE = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;

app.set('trust proxy', 1);

app.use(express.json());

app.use('/ussd', express.urlencoded({ extended: false }));

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://agri-tech-app.onrender.com'
  ],
  credentials: true
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'randomsetofcharacters',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
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
    fullname: { type: DataTypes.STRING, allowNull: false },
    contact: { type: DataTypes.STRING, allowNull: false },
    land_size: { type: DataTypes.FLOAT, allowNull: false },
    soil_type: { type: DataTypes.STRING, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: false },
  }, { timestamps: true });

  const CropProcess = sequelize.define('CropProcess', {
    process_id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    farmers_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'farmers_id' } },
    crop: { type: DataTypes.STRING, allowNull: false },
    process_type: { type: DataTypes.STRING, allowNull: false },
    process_date: { type: DataTypes.DATE, allowNull: false },

    N: { type: DataTypes.FLOAT, allowNull: true },
    P: { type: DataTypes.FLOAT, allowNull: true },
    K: { type: DataTypes.FLOAT, allowNull: true },
    temperature: { type: DataTypes.FLOAT, allowNull: true },
    humidity: { type: DataTypes.FLOAT, allowNull: true },
    ph: { type: DataTypes.FLOAT, allowNull: true },
    rainfall: { type: DataTypes.FLOAT, allowNull: true },

    stage: { type: DataTypes.STRING, allowNull: true },
    suitable: { type: DataTypes.BOOLEAN, allowNull: true },
    suitability_score: { type: DataTypes.FLOAT, allowNull: true },
    flags: { type: DataTypes.JSON, allowNull: true },
    advice: { type: DataTypes.TEXT, allowNull: true },
  });

  const Feedback = sequelize.define('Feedback', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    farmers_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'farmers_id' } },
    date: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    status: { type: DataTypes.BOOLEAN, allowNull: false },
  });

  User.hasMany(CropProcess, { foreignKey: 'farmers_id' });
  User.hasMany(Feedback, { foreignKey: 'farmers_id' });
  CropProcess.belongsTo(User, { foreignKey: 'farmers_id' });
  Feedback.belongsTo(User, { foreignKey: 'farmers_id' });

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

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/', (req, res) => {
  if (req.session.farmers_id) return res.redirect('/home');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/home', (req, res) => {
  if (!req.session.farmers_id) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/forecast', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forecast.html'));
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

app.post('/api/process-eval', async (req, res) => {
  const { crop, stage, N, P, K, temperature, humidity, ph, rainfall } = req.body || {};
  const required = [crop, stage, N, P, K, temperature, humidity, ph, rainfall];
  if (required.some(v => v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v)))) {
    return res.status(400).json({ message: 'Missing fields. Require: crop, stage, N,P,K,temperature,humidity,ph,rainfall' });
  }

  const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
  const pyPath = path.join(__dirname, 'ml', 'process_predict.py');
  const args = [String(crop), String(stage), ...[N, P, K, temperature, humidity, ph, rainfall].map(String)];

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

app.post("/api/diagnose-symptoms", (req, res) => {
  const { symptoms } = req.body;
  if (!symptoms) {
    return res.status(400).json({ error: "Symptoms are required" });
  }

  // Path to your Python file
  const scriptPath = path.join(__dirname, "ml", "diagnosis.py");

  // Pass symptoms as a JSON string to Python
  const py = spawn("python", [scriptPath, JSON.stringify({ symptoms })]);

  let dataBuffer = "";

  py.stdout.on("data", (data) => {
    dataBuffer += data.toString();
  });

  py.stderr.on("data", (data) => {
    console.error(`Python error: ${data}`);
  });

  py.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: "Python script failed" });
    }
    try {
      const result = JSON.parse(dataBuffer);
      res.json(result); // send AI diagnosis back to frontend
    } catch (err) {
      console.error("Parse error:", err);
      res.status(500).json({ error: "Failed to parse diagnosis" });
    }
  });
});

// app.use(express.static(path.join(__dirname, "public")));

app.get("/api/weather", (req, res) => {
  const city = (req.query.city || "").trim();
  if (!city) return res.status(400).json({ message: "city is required" });

  const scriptPath = path.join(__dirname, "ml", "warning_system.py");
  const py = spawn("python", [scriptPath, city]);

  let dataBuffer = "";
  py.stdout.on("data", (data) => {
    dataBuffer += data.toString();
  });

  py.stderr.on("data", (data) => {
    console.error(`Python error: ${data}`);
  });

  py.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({ message: "Python script failed" });
    }
    try {
      const forecast = JSON.parse(dataBuffer);
      res.json(forecast); // send daily forecast back to frontend
    } catch (err) {
      console.error("Parse error:", err);
      res.status(500).json({ message: "Failed to parse forecast" });
    }
  });
});
// app.use(express.static(path.join(__dirname, "public")));
// app.get("/", (req, res) => {
//   res.sendFile(path.join(__dirname, "public", "index.html"));
// });

app.post('/api/ml-recommend', async (req, res) => {
  const { N, P, K, temperature, humidity, ph, rainfall } = req.body || {};
  const nums = [N, P, K, temperature, humidity, ph, rainfall];
  if (nums.some(v => v === undefined || v === null || Number.isNaN(Number(v)))) {
    return res.status(400).json({ message: 'All numeric fields required: N,P,K,temperature,humidity,ph,rainfall' });
  }

  const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
  const pyPath = path.join(__dirname, 'ml', 'predict.py');
  const args = nums.map(String);

  const py = spawn(pyCmd, [pyPath, ...args], { cwd: path.join(__dirname, 'ml') });

  let out = '', err = '';
  py.stdout.on('data', d => out += d.toString());
  py.stderr.on('data', d => err += d.toString());

  py.on('close', code => {
    if (code !== 0) return res.status(500).json({ message: 'ML service error', error: err || out });
    try {
      const mlResult = JSON.parse(out.trim());
      mlResult.aiRecommendationAvailable = true;
      res.json(mlResult);
    }
    catch { res.status(500).json({ message: 'Bad ML output', raw: out }); }
  });
});

const AIService = require('./services/aiService');
let globalAIService = null;

async function initializeAIService() {
  try {
    globalAIService = new AIService();
    await globalAIService.initialize();
  } catch (error) {
    console.error('❌ AI Service initialization failed:', error.message);
    globalAIService = null;
  }
}
initializeAIService();

// === AI Crop Recommendation endpoint (Updated) ===
app.post('/api/ai-crop-recommendation', async (req, res) => {
  try {
    // Extract parameters from request body
    const { N, P, K, ph, rainfall, temperature, humidity } = req.body || {};

    // Validate essential numeric inputs
    const requiredNums = [N, P, rainfall];
    if (requiredNums.some(v => v === undefined || v === null || Number.isNaN(Number(v)))) {
      console.error('Validation Error: Missing or invalid required parameters N, P, or rainfall.');
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid required parameters: N (nitrogen), P (phosphorus), and rainfall are required as numbers.'
      });
    }

    // Build inputData for ML model and Python script, applying defaults if values are missing
    const inputData = {
      nitrogen: Number(N),
      phosphorus: Number(P),
      potassium: K !== undefined && !Number.isNaN(Number(K)) ? Number(K) : 40, // Default K
      ph: ph !== undefined && !Number.isNaN(Number(ph)) ? Number(ph) : 6.5,     // Default pH
      temperature: temperature !== undefined && !Number.isNaN(Number(temperature)) ? Number(temperature) : 25, // Default Temperature
      humidity: humidity !== undefined && !Number.isNaN(Number(humidity)) ? Number(humidity) : 60,     // Default Humidity
      rainfall: Number(rainfall)
    };
    console.log('Input data for ML and AI:', inputData);

    // 1. Get ML recommendation first
    const mlRec = await new Promise((resolve, reject) => {
      // Prepare arguments for the ML script (predict.py)
      const mlScriptArgs = [
        inputData.nitrogen,
        inputData.phosphorus,
        inputData.potassium,
        inputData.temperature,
        inputData.humidity,
        inputData.ph,
        inputData.rainfall
      ].map(String); // All args must be strings for Python spawn
      console.log('ML script arguments:', mlScriptArgs);

      const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
      const pyPath = path.join(__dirname, 'ml', 'predict.py');
      const py = spawn(pyCmd, [pyPath, ...mlScriptArgs], { cwd: path.join(__dirname, 'ml') });

      let stdout = '', stderr = '';
      py.stdout.on('data', d => stdout += d.toString());
      py.stderr.on('data', d => stderr += d.toString());

      py.on('close', code => {
        if (code !== 0) {
          // If ML script exits with an error, reject the promise
          const errorMsg = `ML service error (code ${code}): ${stderr || stdout}`;
          console.error('ML Script Error:', errorMsg);
          reject(new Error(errorMsg));
        } else {
          try {
            // Parse the JSON output from the ML script
            const parsedOutput = JSON.parse(stdout.trim());
            console.log('ML Script Success Output:', parsedOutput);
            resolve(parsedOutput);
          } catch (e) {
            const errorMsg = `Bad ML output JSON: ${stdout.trim()} - ${e.message}`;
            console.error('ML JSON Parsing Error:', errorMsg);
            reject(new Error(errorMsg));
          }
        }
      });
    });

    // Extract the predicted crop from the ML recommendation
    const predictedCrop = mlRec.prediction;
    if (!predictedCrop) {
      console.error('ML Prediction Error: No crop predicted by ML model.');
      return res.status(500).json({ success: false, message: 'ML model did not return a predicted crop.' });
    }
    console.log('ML Predicted Crop:', predictedCrop);

    // 2. Call gemini.py for AI care guide, passing the predicted crop and farming data
    const aiRec = await new Promise((resolve, reject) => {
      const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
      const pyPath = path.join(__dirname, 'ml', 'gemini.py');

      // Prepare input for the gemini.py script, including the predicted crop
      const inputForPython = {
        ...inputData, // Pass all farming data
        crop: predictedCrop // Add the ML-predicted crop
      };
      console.log('Input data for Gemini script:', inputForPython);

      // Pass the entire inputForPython object as a JSON string argument to the Python script
      const args = [JSON.stringify(inputForPython)];
      const py = spawn(pyCmd, [pyPath, ...args], { cwd: path.join(__dirname, 'ml') });

      let stdout = '', stderr = '';
      py.stdout.on('data', d => stdout += d.toString());
      py.stderr.on('data', d => stderr += d.toString());

      py.on('close', code => {
        if (code !== 0) {
          // If Gemini script exits with an error, reject the promise
          const errorMsg = `Gemini AI error (code ${code}): ${stderr || stdout}`;
          console.error('Gemini Script Error:', errorMsg);
          reject(new Error(errorMsg));
        } else {
          try {
            // Parse the JSON output from the Gemini script
            const parsedOutput = JSON.parse(stdout.trim());
            console.log('Gemini Script Success Output:', parsedOutput);
            resolve(parsedOutput);
          } catch (e) {
            const errorMsg = `Bad Gemini output JSON: ${stdout.trim()} - ${e.message}`;
            console.error('Gemini JSON Parsing Error:', errorMsg);
            reject(new Error(errorMsg));
          }
        }
      });
    });

    // 3. Combine results and send to frontend
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      mlRecommendation: mlRec,
      aiRecommendation: aiRec // aiRec now directly contains the structured care guide
    });
    console.log('AI Crop Recommendation successful. Response sent.');

  } catch (error) {
    console.error('AI Crop Recommendation Endpoint Catch Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while generating recommendations',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});



function generateComparisonInsights(mlRec, aiRec) {
  const insights = {
    agreement: false,
    differences: [],
    summary: ''
  };

  try {
    const mlCrop = mlRec.prediction || mlRec.recommended_crop || '';
    const aiCrop = aiRec.primaryCrop || '';

    if (mlCrop.toLowerCase().includes(aiCrop.toLowerCase()) ||
      aiCrop.toLowerCase().includes(mlCrop.toLowerCase())) {
      insights.agreement = true;
      insights.summary = `Both ML and AI models agree on recommending ${aiCrop || mlCrop}`;
    } else {
      insights.agreement = false;
      insights.summary = `ML recommends ${mlCrop}, while AI recommends ${aiCrop}`;
      insights.differences.push(`Different primary crop recommendations: ML suggests ${mlCrop}, AI suggests ${aiCrop}`);
    }

    if (!insights.agreement && aiRec.alternativeCrops) {
      const mlInAlternatives = aiRec.alternativeCrops.some(alt =>
        alt.toLowerCase().includes(mlCrop.toLowerCase()) ||
        mlCrop.toLowerCase().includes(alt.toLowerCase())
      );

      if (mlInAlternatives) {
        insights.differences.push(`ML recommendation (${mlCrop}) appears in AI alternative suggestions`);
      }
    }

    return insights;
  } catch (error) {
    console.error('Error generating comparison insights:', error);
    return {
      agreement: false,
      differences: ['Could not compare recommendations due to formatting differences'],
      summary: 'Both recommendations available but comparison failed'
    };
  }
}

app.post('/api/Evaluation', async (req, res) => {
  if (!ensureDBReady(res)) return;
  try {
    const {
      farmers_id, crop, process_type, process_date,
      N, P, K, temperature, humidity, ph, rainfall,
      stage, suitable, suitability_score, flags, advice
    } = req.body || {};

    if (!farmers_id || !crop || !process_type || !process_date) {
      return res.status(400).json({ message: 'farmers_id, crop, process_type, process_date are required' });
    }

    const saved = await CropProcess.create({
      farmers_id, crop, process_type, process_date,
      N, P, K, temperature, humidity, ph, rainfall,
      stage, suitable, suitability_score,
      flags, advice
    });

    return res.json({ ok: true, process_id: saved.process_id });
  } catch (e) {
    console.error('Evaluation save error:', e);
    return res.status(500).json({ message: 'Error saving process' });
  }
});

app.post('/api/upload-image', upload.single('cropImage'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image uploaded (field: cropImage)' });

    const imgPath = req.file.path;

    const pyPath = path.join(__dirname, 'ml', 'detect_disease.py');
    const fs = require('fs');

    if (!fs.existsSync(pyPath)) {
      return res.json({
        disease: 'Disease detection not available',
        remedies: ['Please consult with an agricultural expert for disease diagnosis']
      });
    }

    const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
    const py = spawn(pyCmd, [pyPath, imgPath], { cwd: path.join(__dirname, 'ml') });

    let out = '', err = '';
    py.stdout.on('data', d => out += d.toString());
    py.stderr.on('data', d => err += d.toString());
    py.on('close', code => {
      if (code !== 0) return res.status(500).json({ message: 'Image ML error', error: err || out });
      try {
        const parsed = JSON.parse(out.trim());
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

app.all('/ussd', async (req, res) => {
  console.log('[USSD HIT]', {
    method: req.method,
    body: req.body,
    query: req.query,
    'content-type': req.headers['content-type']
  });

  const isGet = req.method === 'GET';
  const sessionId = isGet ? req.query.sessionId : req.body.sessionId;
  const phoneNumber = isGet ? req.query.phoneNumber : req.body.phoneNumber;
  const serviceCode = isGet ? req.query.serviceCode : req.body.serviceCode;
  const textRaw = isGet ? req.query.text : req.body.text;

  const text = (textRaw || '').toString();
  const parts = text.split('*').filter(Boolean);
  const first = parts[0];

  if (!parts.length) return ussdReply(res, 'CON', rootUssdMenu());

  try {
    if (first === '1') {
      if (parts.length === 1) return ussdReply(res, 'CON', 'Enter Farmer ID:');
      if (parts.length === 2) return ussdReply(res, 'CON', 'Enter Password:');
      const farmers_id = parts[1];
      const password = parts[2];
      try {
        await apiPost('/api/login', { farmers_id, password });
        return ussdReply(res, 'END', 'Login successful.');
      } catch (e) {
        return ussdReply(res, 'END', `Login failed: ${e.message}`);
      }
    }

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
          N: +N, P: +P, K: +K, ph: +ph, rainfall: +rainfall,
          temperature: +temperature, humidity: +humidity
        });
        const list = Array.isArray(ml.alternatives) && ml.alternatives.length
          ? `\nAlternatives: ${ml.alternatives.slice(0, 5).join(', ')}`
          : '';
        return ussdReply(res, 'END', `${ml.message || 'Recommendation ready.'}${list}`);
      } catch (e) {
        return ussdReply(res, 'END', `Could not get recommendation: ${e.message}`);
      }
    }

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

    if (first === '8') {
      const experts = [
        'Agro Hotline: 0700 000 000',
        'Soil Lab: 0711 111 111',
        'County Ext: 0722 222 222'
      ].join('\n');
      return ussdReply(res, 'END', experts);
    }

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
          N: +N, P: +P, K: +K,
          temperature: +temperature,
          humidity: +humidity,
          ph: +ph,
          rainfall: +rainfall
        });
        const status = (data.prediction === 'suitable') ? 'Suitable' : 'Not suitable';
        const pct = Math.round((data.suitability_score || 0) * 100);
        let msg = `${status}. Score: ${pct}%`;
        const flags = data.flags || {};
        const issues = Object.entries(flags).filter(([, v]) => v !== 'ok');
        if (issues.length) {
          msg += '\nIssues:';
          issues.slice(0, 3).forEach(([k, v]) => { msg += `\n- ${k}: ${v}`; });
        }
        return ussdReply(res, 'END', msg);
      } catch (e) {
        return ussdReply(res, 'END', `Check failed: ${e.message}`);
      }
    }

    return ussdReply(res, 'CON', rootUssdMenu());
  } catch (err) {
    console.error('USSD error:', err);
    return ussdReply(res, 'END', 'An error occurred. Try again later.');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API_BASE: ${API_BASE}`);
  console.log('DB host:', process.env.DB_HOST, 'ssl:', (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true'));
}).on('error', (err) => {
  console.error('Server failed to start:', err);
});