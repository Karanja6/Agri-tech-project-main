import requests
from geopy.geocoders import Nominatim
import json
import sys

def get_forecast(location_name):
    try:
        geolocator = Nominatim(user_agent="weather_app")
        location = geolocator.geocode(location_name)
        if not location:
            return {"error": "❌ Location not found"}

        latitude, longitude = location.latitude, location.longitude

        url = (
            "https://api.open-meteo.com/v1/forecast"
            f"?latitude={latitude}&longitude={longitude}"
            "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum"
            "&forecast_days=16"
            "&timezone=Africa%2FNairobi"
        )

        response = requests.get(url)
        response.raise_for_status()
        data = response.json()

        return {
            "time": data["daily"]["time"],
            "temperature_2m_max": data["daily"]["temperature_2m_max"],
            "temperature_2m_min": data["daily"]["temperature_2m_min"],
            "precipitation_sum": data["daily"]["precipitation_sum"]
        }
        
    except requests.exceptions.RequestException as e:
        return {"error": f"API request failed: {str(e)}"}
    except json.JSONDecodeError:
        return {"error": "Failed to parse API response as JSON."}
    except Exception as e:
        return {"error": f"An unexpected error occurred: {str(e)}"}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No location provided"}))
        sys.exit(1)

    location_name = sys.argv[1]
    forecast = get_forecast(location_name)
    print(json.dumps(forecast))
