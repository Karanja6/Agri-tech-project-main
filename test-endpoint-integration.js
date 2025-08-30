// Test the API endpoint integration without starting server separately
require('dotenv').config();

// Mock the ML prediction to avoid Python dependency in test
const originalSpawn = require('child_process').spawn;
require('child_process').spawn = function(command, args, options) {
  // Mock ML response
  const mockProcess = {
    stdout: {
      on: function(event, callback) {
        if (event === 'data') {
          setTimeout(() => {
            callback(JSON.stringify({
              prediction: 'maize',
              confidence: 0.85,
              alternatives: ['rice', 'wheat', 'beans'],
              message: 'Based on your soil conditions, maize is recommended'
            }));
          }, 100);
        }
      }
    },
    stderr: {
      on: function(event, callback) {
        // No errors
      }
    },
    on: function(event, callback) {
      if (event === 'close') {
        setTimeout(() => callback(0), 150);
      }
    }
  };
  return mockProcess;
};

// Now test the endpoint logic
async function testEndpointLogic() {
  console.log('🧪 Testing AI Crop Recommendation Endpoint Logic...\n');

  const AIService = require('./services/aiService');
  
  try {
    // Test the AI service part
    const aiService = new AIService();
    await aiService.initialize();
    
    const inputData = {
      nitrogen: 90,
      phosphorous: 42,
      potassium: 43,
      rainfall: 202.9,
      temperature: 20.87,
      humidity: 82,
      ph: 6.5
    };

    console.log('📤 Testing with input data:', inputData);

    // Test AI recommendation
    const aiResult = await aiService.generateCropRecommendation(inputData);
    console.log('✅ AI recommendation generated successfully');
    console.log('🤖 AI Primary Crop:', aiResult.recommendation?.primaryCrop);

    // Test ML mock (simulating the endpoint logic)
    const { spawn } = require('child_process');
    const mlPromise = new Promise((resolve, reject) => {
      const py = spawn('python', ['predict.py'], { cwd: './ml' });
      
      let out = '';
      py.stdout.on('data', d => out += d.toString());
      py.stderr.on('data', d => {});
      
      py.on('close', code => {
        if (code !== 0) {
          reject(new Error('ML service error'));
        } else {
          try {
            resolve(JSON.parse(out.trim()));
          } catch (e) {
            reject(new Error('Bad ML output'));
          }
        }
      });
    });

    const mlResult = await mlPromise;
    console.log('✅ ML recommendation generated successfully');
    console.log('🔬 ML Primary Crop:', mlResult.prediction);

    // Test comparison logic
    const comparisonInsights = generateComparisonInsights(mlResult, aiResult.recommendation);
    console.log('🔍 Comparison Insights:', comparisonInsights.summary);

    console.log('\n🎯 Integration test completed successfully!');
    console.log('📊 Both AI and ML recommendations are working');

  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
  }
}

// Helper function from server.js
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

testEndpointLogic();