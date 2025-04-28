const express = require('express');
const bcrypt = require('bcryptjs');
const Sequelize = require('sequelize');
const { DataTypes } = require('sequelize');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
require('dotenv').config();
const app = express();
const path = require('path');
const multer = require('multer');
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'randomsetofcharacters',
  resave: false,
  saveUninitialized: true,
}));

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: '*',
  credentials: true,
}));

const { DB_USER, DB_PASSWORD, DB_HOST } = process.env;
let sequelizeWithDB;
let User, CropProcess, Feedback;
async function initializeDatabase() {
  try {
    const sequelizeWithoutDB = new Sequelize(`mysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:3306`, { logging: console.log });
    await sequelizeWithoutDB.authenticate();
    console.log('Connection to MySQL server has been established successfully.');
    await sequelizeWithoutDB.query('CREATE DATABASE IF NOT EXISTS farmers_db');
    console.log('Database "farmers_db" created or already exists.');
    sequelizeWithDB = new Sequelize(`mysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:3306/farmers_db`, { logging: console.log });
    await sequelizeWithDB.authenticate();
    console.log('Connected to the "farmers_db" successfully.');
    ({ User, CropProcess, Feedback } = defineModels(sequelizeWithDB));
    await sequelizeWithDB.sync({ alter: true });
    console.log('Database synced successfully!');
  } catch (error) {
    console.error('Unable to initialize the database:', error);
  }
}
function defineModels(sequelize) {
  const User = sequelize.define('User', {
    farmers_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      unique: true,
    },
    fullname: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    contact: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    land_size: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    soil_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  }, { timestamps: true });
  const CropProcess = sequelize.define('CropProcess', {
    process_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    farmers_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'farmers_id',
      },
    },
    crop: { 
      type: DataTypes.STRING, 
      allowNull: false 
    },
    process_type: { 
      type: DataTypes.STRING,
      allowNull: false,
    },
    process_date: { 
      type: DataTypes.DATE, 
      allowNull: false, 
    },
  });
  const Feedback = sequelize.define('Feedback', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    farmers_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'farmers_id',
      },
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW,
    },
    status: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
  });
  User.hasMany(CropProcess, { foreignKey: 'farmers_id' });
  User.hasMany(Feedback, { foreignKey: 'farmers_id' });
  CropProcess.belongsTo(User, { foreignKey: 'farmers_id' });
  Feedback.belongsTo(User, { foreignKey: 'farmers_id' });

  return { User, CropProcess, Feedback };
}
initializeDatabase()
  .then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Unable to initialize database:', err);
  });

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
app.post('/api/Evaluation', async (req, res) => {
  const { farmers_id, crop, process_type, process_date } = req.body;

  try {
    const newProcess = await CropProcess.create({
      farmers_id,
      crop,
      process_type,
      process_date,
    });
    res.status(201).json({ message: 'Crop process recorded successfully', process: newProcess });
  } catch (error) {
    console.error('Error recording crop process:', error);
    res.status(500).json({ message: 'An error occurred while recording the crop process', error: error.message });
  }
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
    const newFeedback = await Feedback.create({
      farmers_id,
      status,
    });
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
      where: { farmers_id: farmers_id },
      order: [['process_date', 'DESC']], 
    });
    res.json({ processes });
  } catch (error) {
    console.error('Error retrieving processes:', error);
    res.status(500).json({ message: 'Error retrieving processes' });
  }
});
