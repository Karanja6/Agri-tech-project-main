// Test AI service directly
require('dotenv').config();
const AIService = require('./services/aiService');

async function testAIService() {
  console.log('Testing AI Service...');
  console.log('GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
  console.log('GEMINI_API_KEY value:', process.env.GEMINI_API_KEY ? 'Set' : 'Not set');
  
  try {
    const aiService = new AIService();
    console.log('AI Service created');
    
    await aiService.initialize();
    console.log('AI Service initialized successfully');
    
    const testData = {
      nitrogen: 90,
      phosphorous: 50,
      potassium: 45,
      rainfall: 150,
      temperature: 25,
      humidity: 65,
      ph: 6.5
    };
    
    console.log('Testing crop recommendation...');
    const result = await aiService.generateCropRecommendation(testData);
    console.log('Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

testAIService();