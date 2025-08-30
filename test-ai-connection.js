const AIService = require('./services/aiService');

async function testAIConnection() {
  console.log('🚀 Testing Gemini AI connection...\n');
  
  const aiService = new AIService();
  
  // Display configuration
  console.log('📋 Configuration:');
  const config = aiService.getConfig();
  console.log(`- Conversation Timeout: ${config.conversationTimeout}ms`);
  console.log(`- Max Conversation Length: ${config.maxConversationLength}`);
  console.log(`- Rate Limit Per Minute: ${config.rateLimitPerMinute}`);
  console.log(`- Has Valid API Key: ${config.hasValidApiKey}`);
  console.log(`- Is Initialized: ${config.isInitialized}\n`);
  
  // Test connection
  try {
    const result = await aiService.testConnection();
    
    if (result.success) {
      console.log('✅ SUCCESS: AI service is properly configured and connected');
      console.log(`📝 Test Response: ${result.testResponse}`);
    } else {
      console.log('❌ FAILED: AI service connection failed');
      console.log(`📝 Error: ${result.error}`);
    }
  } catch (error) {
    console.log('❌ FAILED: Unexpected error during connection test');
    console.log(`📝 Error: ${error.message}`);
  }
}

// Run the test
testAIConnection();