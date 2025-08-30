// Test the AI crop recommendation endpoint directly
const axios = require('axios');

async function testAICropRecommendation() {
  console.log('Testing AI Crop Recommendation endpoint...');
  
  const testData = {
    N: 90,
    P: 50,
    K: 45,
    temperature: 25,
    humidity: 65,
    ph: 6.5,
    rainfall: 150
  };
  
  try {
    const response = await axios.post('http://localhost:3000/api/ai-crop-recommendation', testData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    }
  }
}

testAICropRecommendation();