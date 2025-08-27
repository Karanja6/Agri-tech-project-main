// server.js
const express = require('express');
const bcrypt = require('bcryptjs');
const Sequelize = require('sequelize');
const { DataTypes } = require('sequelize');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
require('dotenv').config();
const PORT = process.env.PORT || 3000;
const app = express();
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const { spawn } = require('child_process');

// static files
app.use(express.static(path.join(__dirname, 'public')));

// sessions
app.use(session({
  secret: 'randomsetofcharacters',
  resave: false,
  saveUninitialized: true,
}));

// body parsing
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));

// cors
app.use(cors({
  origin: '*',
  credentials: true,
}));

// ---- DB init ----
const { DB_USER, DB_PASSWORD, DB_HOST } = process.env;
let sequelizeWithDB;
let User, CropProcess, Feedback;
function defineModels(sequelize) {
  const User = sequelize.define('User', {
    farmers_id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false, unique: true },
    fullname:   { type: DataTypes.STRING, allowNull: false },
    contact:    { type: DataTypes.INTEGER, allowNull: false },
    land_size:  { type: DataTypes.INTEGER, allowNull: false },
    soil_type:  { type: DataTypes.STRING, allowNull: false },
    password:   { type: DataTypes.STRING, allowNull: false },
  }, { timestamps: true });

  const CropProcess = sequelize.define('CropProcess', {
    process_id:   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    farmers_id:   { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'farmers_id' } },
    crop:         { type: DataTypes.STRING,  allowNull: false },
    process_type: { type: DataTypes.STRING,  allowNull: false }, // e.g. planting/harvest/etc.
    process_date: { type: DataTypes.DATE,    allowNull: false },

    // NEW: readings (nullable to keep compatibility)
    N:           { type: DataTypes.FLOAT, allowNull: true },
    P:           { type: DataTypes.FLOAT, allowNull: true },
    K:           { type: DataTypes.FLOAT, allowNull: true },
    temperature: { type: DataTypes.FLOAT, allowNull: true },
    humidity:    { type: DataTypes.FLOAT, allowNull: true },
    ph:          { type: DataTypes.FLOAT, allowNull: true },
    rainfall:    { type: DataTypes.FLOAT, allowNull: true },

    // NEW: ML outputs
    stage:             { type: DataTypes.STRING, allowNull: true },  // normalized stage name used by model
    suitable:          { type: DataTypes.BOOLEAN, allowNull: true }, // true/false
    suitability_score: { type: DataTypes.FLOAT,   allowNull: true }, // probability
    flags:             { type: DataTypes.JSON,    allowNull: true }, // {N:'low',...}
    advice:            { type: DataTypes.TEXT,    allowNull: true }, // "Increase N, Reduce humidity"
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
const stageMap = {
  land_prep: "land_prep",
  planting: "planting",
  irrigation: "irrigation",
  weed_control: "weed_control",
  pest_management: "pest_management",
  fertilization: "fertilization",
  harvest: "harvest",
  soil_management: "soil_management"
};
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
        logging: console.log,
      }
    );

    await sequelizeWithDB.authenticate();
    console.log('✅ Connected to PostgreSQL database');

    ({ User, CropProcess, Feedback } = defineModels(sequelizeWithDB));
    await sequelizeWithDB.sync({ alter: true });
    console.log('✅ Models synced successfully');
  } catch (error) {
    console.error('❌ Unable to connect to PostgreSQL:', error);
  }
}
initializeDatabase();
// ---- Routes ----
app.post('/api/register', async (req, res) => {
  const { farmers_id, fullName, contact, land_size, soil_type, password, confirmPassword } = req.body;
  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match' });
  }
  try {
    const existingUser = await User.findOne({ where: { farmers_id } });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this ID already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      farmers_id,
      fullname: fullName,
      contact,
      land_size,
      soil_type,
      password: hashedPassword,
    });
    res.status(201).json({ message: 'User registered successfully', redirectTo: '/home' });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ message: 'An error occurred while registering the user', error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { farmers_id, password } = req.body;
  try {
    const user = await User.findOne({ where: { farmers_id } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid farmers ID or password' });
    }
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Invalid farmers ID or password' });
    }
    req.session.farmers_id = user.farmers_id;
    res.status(200).json({ message: 'Login successful', redirectTo: '/home' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});
// === Process stage evaluation endpoint ===
// === Stage-aware process evaluation (Windows-safe) ===
app.post('/api/process-eval', async (req, res) => {
  const { crop, stage, N, P, K, temperature, humidity, ph, rainfall } = req.body || {};
  const required = [crop, stage, N, P, K, temperature, humidity, ph, rainfall];

  if (required.some(v => v === undefined || v === null || (typeof v === 'number' && isNaN(v)))) {
    return res.status(400).json({ message: 'Missing fields. Require: crop, stage, N,P,K,temperature,humidity,ph,rainfall' });
  }

  const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
  const pyPath = path.join(__dirname, 'ml', 'process_predict.py');

  // process_predict.py expects: crop stage N P K temperature humidity ph rainfall
  const args = [
    String(crop), String(stage),
    ...[N, P, K, temperature, humidity, ph, rainfall].map(String)
  ];

  const py = spawn(pyCmd, [pyPath, ...args], { cwd: path.join(__dirname, 'ml') });

  let out = '', err = '';
  py.stdout.on('data', d => out += d.toString());
  py.stderr.on('data', d => err += d.toString());

  py.on('close', code => {
    if (code !== 0) {
      return res.status(500).json({ message: 'ML process error', error: err || out });
    }
    try {
      return res.json(JSON.parse(out.trim()));
    } catch {
      return res.status(500).json({ message: 'Bad ML output', raw: out });
    }
  });
});

app.get('/home', (req, res) => {
  if (!req.session.farmers_id) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.post('/api/feedback', async (req, res) => {
  const farmers_id = req.session.farmers_id;
  console.log('Farmers ID from session:', farmers_id);

  const status = req.body.status === 'true';
  console.log('Feedback status:', status);

  try {
    const newFeedback = await Feedback.create({ farmers_id, status });
    console.log('New feedback created:', newFeedback);
    res.status(201).json({ message: 'Feedback submitted successfully', feedbackId: newFeedback.id });
  } catch (error) {
    console.error('Error inserting feedback:', error);
    res.status(500).json({ message: 'Error saving feedback' });
  }
});

app.get('/api/get-processes', async (req, res) => {
  const { farmers_id } = req.query;
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
    const reply = response.data.choices[0].text.trim();
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
    try {
      parsed = JSON.parse(reply);
    } catch {
      return res.status(500).json({ error: 'Invalid JSON format in AI response', raw: reply });
    }

    if (!parsed.disease || !Array.isArray(parsed.remedies)) {
      return res.status(500).json({ error: 'Malformed AI response structure.', raw: reply });
    }

    res.json(parsed);
  } catch (error) {
    console.error('Error from DeepInfra:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to analyze symptoms' });
  }
});

// === ML recommend endpoint (Windows-safe) ===
app.post('/api/ml-recommend', async (req, res) => {
  const { N, P, K, temperature, humidity, ph, rainfall } = req.body || {};
  const nums = [N, P, K, temperature, humidity, ph, rainfall];

  if (nums.some(v => v === undefined || v === null || isNaN(Number(v)))) {
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
    try { res.json(JSON.parse(out.trim())); }
    catch { res.status(500).json({ message: 'Bad ML output', raw: out }); }
  });
});
app.post('/api/process-eval-save', async (req, res) => {
  try {
    const {
      farmers_id, crop, process_type, process_date,
      N, P, K, temperature, humidity, ph, rainfall
    } = req.body || {};

    // simple validation
    if (!farmers_id || !crop || !process_type || !process_date) {
      return res.status(400).json({ message: 'farmers_id, crop, process_type, process_date are required' });
    }
    const stage = stageMap[String(process_type).trim()] || String(process_type).trim();

    const nums = [N, P, K, temperature, humidity, ph, rainfall].map(v => Number(v));
    if (nums.some(v => Number.isNaN(v))) {
      return res.status(400).json({ message: 'All readings must be numeric: N,P,K,temperature,humidity,ph,rainfall' });
    }

    // call Python
    const pyCmd  = process.platform === 'win32' ? 'python' : 'python3';
    const pyPath = path.join(__dirname, 'ml', 'process_predict.py');
    const args   = [crop, stage, ...nums.map(String)];

    const py = spawn(pyCmd, [pyPath, ...args], { cwd: path.join(__dirname, 'ml') });

    let out = '', err = '';
    py.stdout.on('data', d => out += d.toString());
    py.stderr.on('data', d => err += d.toString());

    py.on('close', async (code) => {
      if (code !== 0) {
        return res.status(500).json({ message: 'ML process error', error: err || out });
      }

      let result;
      try { result = JSON.parse(out.trim()); }
      catch (e) { return res.status(500).json({ message: 'Bad ML output', raw: out }); }

      // result shape from process_predict.py:
      // { prediction: "suitable"|"not suitable",
      //   suitability_score: 0.87,
      //   flags: {...}, advice: "Increase N, Reduce humidity" }

      const suitable = result.prediction === 'suitable';
      const saved = await CropProcess.create({
        farmers_id, crop, process_type, process_date,
        N: nums[0], P: nums[1], K: nums[2],
        temperature: nums[3], humidity: nums[4],
        ph: nums[5], rainfall: nums[6],
        stage, suitable,
        suitability_score: result.suitability_score ?? null,
        flags: result.flags ?? null,
        advice: result.advice ?? null,
      });

      res.json({ ok: true, saved_id: saved.process_id, ...result });
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
  console.error('Server failed to start:', err);
});

