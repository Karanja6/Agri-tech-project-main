import os
import sys
import json
from dotenv import load_dotenv
import google.generativeai as genai
from google.generativeai import GenerativeModel # Import GenerativeModel

# Load environment variables from .env file
load_dotenv()

# Read API key from .env using the specified variable name
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") # Use GOOGLE_API_KEY as per example
if not GOOGLE_API_KEY:
    error_message = "❌ GOOGLE_API_KEY not found in .env file"
    print(json.dumps({"care_guide": "", "error": error_message})) # Output structured error to stdout
    print(error_message, file=sys.stderr) # Also print to stderr for robust error capturing
    sys.exit(1)

# Configure Gemini client
try:
    genai.configure(api_key=GOOGLE_API_KEY)
    # Instantiate the model using GenerativeModel directly
    model = GenerativeModel('gemini-2.0-flash') # Using gemini-1.0-pro as it's more stable for text, or 'gemini-2.0-flash' if preferred
except Exception as e:
    error_message = f"❌ Failed to initialize Google AI model: {e}"
    print(json.dumps({"care_guide": "", "error": error_message})) # Output structured error to stdout
    print(error_message, file=sys.stderr) # Also print to stderr
    sys.exit(1)

# Prompt template for crop care guidance
crop_care_prompt = """
You are an expert agricultural AI assistant. Based on the ML prediction for **{crop}**
and the following farming conditions, provide a detailed and practical care guide:

Soil Nutrient Analysis:
- pH: {ph}
- Nitrogen (N): {nitrogen} ppm
- Phosphorus (P): {phosphorus} ppm
- Potassium (K): {potassium} ppm

Environmental Conditions:
- Temperature: {temperature}°C
- Humidity: {humidity}%
- Rainfall: {rainfall} mm

Please provide a comprehensive guide covering the following aspects for **{crop}**:

1.  **Nutrient Management**: Specific fertilizer recommendations and timing.
2.  **Water Management**: Irrigation needs and optimal watering schedules.
3.  **Pest and Disease Control**: Common issues to watch for and natural prevention methods.
4.  **Growth Stages and Timelines**: Key stages of the crop's life cycle from planting to harvest.
5.  **General Tips**: Any additional advice to maximize yield and soil health.

Structure the response clearly for a farmer to follow.
"""

# --- Function to generate crop care guide ---
def get_crop_care_guide(farming_data):
    # Ensure all expected keys are present, providing defaults if missing
    data_for_prompt = {
        "crop": farming_data.get("crop", "a specific crop"),
        "ph": farming_data.get("ph", "Not provided"),
        "nitrogen": farming_data.get("nitrogen", "Not provided"),
        "phosphorus": farming_data.get("phosphorus", "Not provided"),
        "potassium": farming_data.get("potassium", "Not provided"),
        "temperature": farming_data.get("temperature", "Not provided"),
        "humidity": farming_data.get("humidity", "Not provided"),
        "rainfall": farming_data.get("rainfall", "Not provided")
    }

    # Fill the template with the provided data
    prompt = crop_care_prompt.format(**data_for_prompt)

    try:
        # Using a generation_config for potentially better output
        generation_config = {
            "temperature": 0.7,  # Moderate creativity
            "top_p": 1,
            "top_k": 1,
            "max_output_tokens": 1024, # Ensure enough tokens for a comprehensive guide
        }
        
        response = model.generate_content(
            contents=[{"role": "user", "parts": [{"text": prompt}]}],
            generation_config=generation_config
        )
        
        # Check for candidates and parts before accessing .text
        if response and response.candidates and response.candidates[0].content.parts:
            return {"care_guide": response.candidates[0].content.parts[0].text, "error": None}
        else:
            error_message = "Gemini API returned no candidates or empty content."
            print(error_message, file=sys.stderr) # Print to stderr for visibility
            return {"care_guide": "", "error": error_message}
    except Exception as e:
        error_message = f"❌ Gemini API call failed during content generation: {e}"
        print(error_message, file=sys.stderr) # Print actual exception to stderr
        return {"care_guide": "", "error": error_message}

# --- Main execution ---
if __name__ == "__main__":
    if len(sys.argv) < 2:
        error_message = "No input data provided to gemini.py"
        print(json.dumps({"care_guide": "", "error": error_message}))
        print(error_message, file=sys.stderr)
        sys.exit(1)

    try:
        # Parse JSON string from Node.js
        user_input = json.loads(sys.argv[1])
    except json.JSONDecodeError:
        error_message = "Invalid JSON input to gemini.py"
        print(json.dumps({"care_guide": "", "error": error_message}))
        print(error_message, file=sys.stderr)
        sys.exit(1)

    # Generate care guide
    result = get_crop_care_guide(user_input)

    # Print as JSON for Node.js
    print(json.dumps(result))
