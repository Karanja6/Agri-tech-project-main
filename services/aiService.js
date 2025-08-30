const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

class AIService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.ai = null;
    this.isInitialized = false;

    // Configuration settings
    this.config = {
      conversationTimeout: parseInt(process.env.AI_CONVERSATION_TIMEOUT) || 1800000, // 30 minutes
      maxConversationLength: parseInt(process.env.AI_MAX_CONVERSATION_LENGTH) || 50,
      rateLimitPerMinute: parseInt(process.env.AI_RATE_LIMIT_PER_MINUTE) || 60,
      model: 'gemini-2.0-flash-001'
    };

    // Agricultural system prompt for tuning AI responses
    this.agriculturalSystemPrompt = `You are an expert agricultural AI assistant specializing in crop recommendations and farming guidance. Your expertise includes:

- Crop selection based on soil conditions, climate, and environmental factors
- Soil analysis and nutrient management recommendations
- Weather pattern analysis for optimal planting and harvesting
- Pest and disease identification and management strategies
- Sustainable farming practices and organic methods
- Irrigation and water management techniques
- Crop rotation and companion planting strategies
- Market trends and crop profitability analysis

Always provide practical, actionable advice tailored to the farmer's specific conditions. Consider local climate, soil type, available resources, and farming experience level. Focus on sustainable and profitable farming practices.

When making crop recommendations, always consider:
1. Soil pH, nutrients (N-P-K), and organic matter
2. Climate conditions (temperature, rainfall, humidity)
3. Growing season and planting calendar
4. Water availability and irrigation needs
5. Market demand and profitability
6. Farmer's experience and resources
7. Pest and disease resistance
8. Sustainable farming practices`;
  }

  /**
   * Initialize the Gemini AI client
   */
  async initialize() {
    try {
      if (!this.apiKey || this.apiKey === 'your_gemini_api_key_here') {
        throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in environment variables.');
      }

      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
      this.isInitialized = true;

      console.log('✅ Gemini AI service initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Gemini AI service:', error.message);
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Test the connection to Gemini AI API
   */
  async testConnection() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const testPrompt = "Hello, this is a connection test for an agricultural AI system. Please respond with 'Agricultural AI connection successful' and briefly mention your expertise in crop recommendations.";

      const response = await this.ai.models.generateContent({
        model: this.config.model,
        contents: [{ role: "user", parts: [{ text: testPrompt }] }]
      });

      console.log('🔗 Connection test successful. Response:', response.text);
      return {
        success: true,
        message: 'Connection to Gemini AI established successfully',
        testResponse: response.text
      };
    } catch (error) {
      console.error('❌ Connection test failed:', error.message);
      return {
        success: false,
        message: 'Failed to connect to Gemini AI',
        error: error.message
      };
    }
  }

  /**
   * Check if the AI service is properly configured and ready
   */
  isReady() {
    return this.isInitialized && this.apiKey && this.apiKey !== 'your_gemini_api_key_here';
  }

  /**
   * Generate agricultural content with system prompt
   */
  async generateAgriculturalContent(userPrompt, context = {}) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Combine system prompt with user prompt and context
      const fullPrompt = `${this.agriculturalSystemPrompt}

Context Information:
${context.soilData ? `Soil Data: ${JSON.stringify(context.soilData)}` : ''}
${context.weatherData ? `Weather Data: ${JSON.stringify(context.weatherData)}` : ''}
${context.location ? `Location: ${context.location}` : ''}
${context.farmingExperience ? `Farming Experience: ${context.farmingExperience}` : ''}

User Question: ${userPrompt}

Please provide a detailed, practical response focused on agricultural best practices.`;

      const response = await this.ai.models.generateContent({
        model: this.config.model,
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }]
      });

      return {
        success: true,
        content: response.text,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to generate agricultural content:', error.message);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate crop recommendations based on input parameters
   */
  async generateCropRecommendations(farmingData) {
    const prompt = `Based on the following farming conditions, provide specific crop recommendations:

Soil Conditions:
- pH: ${farmingData.soilPH || 'Not specified'}
- Nitrogen (N): ${farmingData.nitrogen || 'Not specified'}
- Phosphorus (P): ${farmingData.phosphorus || 'Not specified'}
- Potassium (K): ${farmingData.potassium || 'Not specified'}
- Organic Matter: ${farmingData.organicMatter || 'Not specified'}

Climate Conditions:
- Temperature: ${farmingData.temperature || 'Not specified'}°C
- Humidity: ${farmingData.humidity || 'Not specified'}%
- Rainfall: ${farmingData.rainfall || 'Not specified'}mm

Location: ${farmingData.location || 'Not specified'}
Farm Size: ${farmingData.farmSize || 'Not specified'}
Experience Level: ${farmingData.experience || 'Not specified'}

Please provide:
1. Top 3 recommended crops with reasons
2. Planting timeline and season recommendations
3. Expected yield and profitability estimates
4. Specific care instructions for each crop
5. Potential challenges and mitigation strategies`;

    return await this.generateAgriculturalContent(prompt, farmingData);
  }

  /**
   * Generate crop recommendation based on NPK values and environmental data
   * This method is specifically designed for the API endpoint integration
   */
  async generateCropRecommendation(inputData, conversationHistory = []) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Validate input data
      const { nitrogen, phosphorous, rainfall, temperature, humidity, ph } = inputData;
      
      if (nitrogen === undefined || phosphorous === undefined || rainfall === undefined) {
        throw new Error('Missing required parameters: nitrogen, phosphorous, and rainfall are required');
      }

      // Create detailed prompt for crop recommendation
      const prompt = `${this.agriculturalSystemPrompt}

CROP RECOMMENDATION REQUEST:

Soil Nutrient Analysis:
- Nitrogen (N): ${nitrogen} ppm
- Phosphorous (P): ${phosphorous} ppm
- Potassium (K): ${inputData.potassium || 'Not provided'} ppm
- Soil pH: ${ph || 'Not provided'}

Environmental Conditions:
- Rainfall: ${rainfall} mm
- Temperature: ${temperature || 'Not provided'}°C
- Humidity: ${humidity || 'Not provided'}%

${conversationHistory.length > 0 ? `
Previous Conversation Context:
${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}
` : ''}

Based on these soil nutrient levels and environmental conditions, please provide:

1. **Primary Crop Recommendation**: The single best crop for these conditions with detailed reasoning
2. **Alternative Crops**: 2-3 other suitable crops with brief explanations
3. **Detailed Analysis**: Explain how the NPK levels and environmental factors influence your recommendations
4. **Farming Tips**: Specific advice for optimizing growth with these soil conditions
5. **Seasonal Considerations**: Best planting times and seasonal care recommendations
6. **Potential Challenges**: What issues to watch for and how to address them

Format your response in a clear, structured manner that a farmer can easily understand and act upon.`;

      const response = await this.ai.models.generateContent({
        model: this.config.model,
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });

      // Parse and structure the AI response
      const recommendation = this.parseAIRecommendation(response.text);

      return {
        success: true,
        recommendation,
        conversationId: this.generateConversationId(),
        followUpSuggestions: [
          "What specific fertilizers should I use for this crop?",
          "When is the best time to plant in my region?",
          "How can I improve my soil for better yields?",
          "What are the common pests for this crop and how do I manage them?"
        ],
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Failed to generate crop recommendation:', error.message);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
  
    /**
   * Generate a comprehensive crop care guide for a specific crop based on a recommendation.
   */
  async generateCropCareGuide(cropName, farmingData) {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const { nitrogen, phosphorous, potassium, ph, rainfall, temperature, humidity } = farmingData;

      const prompt = `${this.agriculturalSystemPrompt}
        
Based on the ML recommendation for the crop "${cropName}", please provide a detailed, practical care guide for a farmer with the following conditions:
        
Soil Nutrient Analysis:
- Nitrogen (N): ${nitrogen || 'Not provided'} ppm
- Phosphorous (P): ${phosphorous || 'Not provided'} ppm
- Potassium (K): ${potassium || 'Not provided'} ppm
- Soil pH: ${ph || 'Not provided'}
        
Environmental Conditions:
- Rainfall: ${rainfall || 'Not provided'} mm
- Temperature: ${temperature || 'Not provided'}°C
- Humidity: ${humidity || 'Not provided'}%
        
Please provide a comprehensive guide covering the following aspects for **${cropName}**:
        
1.  **Nutrient Management**: Specific fertilizer recommendations and timing.
2.  **Water Management**: Irrigation needs and optimal watering schedules.
3.  **Pest and Disease Control**: Common issues to watch for and natural prevention methods.
4.  **Growth Stages and Timelines**: Key stages of the crop's life cycle from planting to harvest.
5.  **General Tips**: Any additional advice to maximize yield and soil health.
        
Structure the response clearly for a farmer to follow.`;

function extractAIText(response) {
  if (response?.response?.candidates?.length) {
    return response.response.candidates[0].content.parts
      .map(part => part.text || "")
      .join(" ");
  }
  return "";
}

      const response = await this.ai.models.generateContent({
        model: this.config.model,
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });

      return {
        success: true,
        content: extractAIText(response),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to generate crop care guide:', error.message);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }


  parseAIRecommendation(aiResponse) {
    // Extract key information from AI response
    // This is a simple parser - could be enhanced with more sophisticated NLP
    
    const lines = aiResponse.split('\n').filter(line => line.trim());
    
    // Try to extract primary crop (look for patterns like "Primary Crop:" or "Best crop:")
    let primaryCrop = 'Not specified';
    let alternativeCrops = [];
    let reasoning = aiResponse;
    let farmingTips = [];
    let seasonalAdvice = '';

    // Simple pattern matching to extract structured information
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      if (line.includes('primary crop') || line.includes('best crop') || line.includes('recommended crop') || line.includes('recommendation:')) {
        // Try to extract crop name from current and next few lines
        for (let j = i; j < Math.min(i + 3, lines.length); j++) {
          const cropMatch = lines[j].match(/\b(okra|maize|corn|wheat|rice|beans|soybean|tomato|potato|cassava|millet|sorghum|barley|oats|sunflower|groundnut|peanut|cotton|sugarcane|banana|plantain|yam|sweet potato|cabbage|lettuce|spinach|kale|onion|garlic|pepper|chili|cucumber|watermelon|pumpkin|squash|cowpeas|eggplant|jute|coffee)\b/i);
          if (cropMatch) {
            primaryCrop = cropMatch[1];
            break;
          }
        }
      }
      
      if (line.includes('alternative') || line.includes('other suitable')) {
        // Extract alternative crops from next few lines
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const cropMatches = lines[j].match(/\b(maize|corn|wheat|rice|beans|soybean|tomato|potato|cassava|millet|sorghum|barley|oats|sunflower|groundnut|peanut|cotton|sugarcane|banana|plantain|yam|sweet potato|cabbage|lettuce|spinach|kale|onion|garlic|pepper|chili|cucumber|watermelon|pumpkin|squash)\b/gi);
          if (cropMatches) {
            alternativeCrops.push(...cropMatches.filter(crop => crop.toLowerCase() !== primaryCrop.toLowerCase()));
          }
        }
      }
    }

    // Remove duplicates from alternatives
    alternativeCrops = [...new Set(alternativeCrops)].slice(0, 3);

    return {
      primaryCrop,
      alternativeCrops,
      reasoning: aiResponse,
      farmingTips: farmingTips.length > 0 ? farmingTips : [
        "Monitor soil moisture regularly",
        "Apply fertilizers based on soil test results",
        "Practice crop rotation for soil health"
      ],
      seasonalAdvice: seasonalAdvice || "Plant during the appropriate season for your region"
    };
  }

  generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }


  getConfig() {
    return {
      ...this.config,
      isInitialized: this.isInitialized,
      hasValidApiKey: this.apiKey && this.apiKey !== 'your_gemini_api_key_here'
    };
  }
}

module.exports = AIService;