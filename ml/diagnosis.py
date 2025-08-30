import os
import sys
import json
from dotenv import load_dotenv
import google.generativeai as genai
from google.generativeai import GenerativeModel

# Load environment variables
load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if not GOOGLE_API_KEY:
    error_message = "❌ GOOGLE_API_KEY not found in .env file"
    print(json.dumps({"diagnosis": "", "error": error_message}))
    print(error_message, file=sys.stderr)
    sys.exit(1)

# Configure Gemini
try:
    genai.configure(api_key=GOOGLE_API_KEY)
    model = GenerativeModel('gemini-2.0-flash')
except Exception as e:
    error_message = f"❌ Failed to initialize Google AI model: {e}"
    print(json.dumps({"diagnosis": "", "error": error_message}))
    sys.exit(1)

# Disease diagnosis prompt (image-focused)
disease_diagnosis_prompt = """
You are an expert agricultural plant pathologist AI. 
Analyze the uploaded crop image and provide a farmer-friendly diagnosis.

Please provide:
1. **Likely Disease(s)**: Identify possible diseases and explain symptoms visible in the image.
2. **Immediate Actions**: What the farmer should do right now.
3. **Treatment Options**: Chemical (if necessary) and organic/bio-control methods.
4. **Prevention Tips**: How to avoid recurrence of this disease in the future.
5. **Confidence Level**: High, Medium, or Low.

Keep the explanation clear and simple for farmers.
"""

# --- Function to analyze disease from image ---
def get_disease_diagnosis(image_path):
    try:
        # Upload the image to Gemini
        uploaded_file = genai.upload_file(path=image_path)

        generation_config = {
            "temperature": 0.4,  # keep factual
            "top_p": 1,
            "top_k": 1,
            "max_output_tokens": 1024,
        }

        response = model.generate_content(
            contents=[
                {"role": "user", "parts": [{"text": disease_diagnosis_prompt}]},
                {"role": "user", "parts": [uploaded_file]}  # attach image
            ],
            generation_config=generation_config
        )

        if response and response.candidates and response.candidates[0].content.parts:
            return {"diagnosis": response.candidates[0].content.parts[0].text, "error": None}
        else:
            return {"diagnosis": "", "error": "Gemini API returned no candidates or empty content."}

    except Exception as e:
        error_message = f"❌ Gemini API call failed: {e}"
        return {"diagnosis": "", "error": error_message}

# --- Main execution ---
if __name__ == "__main__":
    if len(sys.argv) < 2:
        error_message = "No image path provided"
        print(json.dumps({"diagnosis": "", "error": error_message}))
        sys.exit(1)

    image_path = sys.argv[1]

    if not os.path.exists(image_path):
        error_message = f"Image file not found: {image_path}"
        print(json.dumps({"diagnosis": "", "error": error_message}))
        sys.exit(1)

    result = get_disease_diagnosis(image_path)

    print(json.dumps(result))
