document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const farmersId = document.getElementById('farmers_id').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('http://localhost:3000/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ farmers_id: farmersId, password: password }),
                });

                const data = await response.json();
                if (response.ok) {
                    window.location.href = "/home.html"; 
                } else {
                    alert(`Login failed: ${data.message}`);
                }
            } catch (error) {
                console.error('Login failed:', error);
                alert('Server error. Please try again later.');
            }
        });
    }

    const registerForm = document.getElementById('signup_form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(registerForm);
            const farmers_id = formData.get('farmers_id');
            const fullName = formData.get('name');
            const contact = formData.get('contact');
            const land_size = formData.get('land_size');
            const soil_type = formData.get('soil_type');
            const password = formData.get('password');
            const confirmPassword = formData.get('confirm_password');
            if (password !== confirmPassword) {
                alert('Passwords do not match');
                return;
            }
            try {
                const response = await fetch('http://localhost:3000/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        farmers_id, fullName, contact, land_size, soil_type, password, confirmPassword
                    }),
                });
                const data = await response.json();
                if (response.ok) {
                    window.location.href = "/home.html"; 
                } else {
                    alert(`Registration failed: ${data.message}`);
                }
            } catch (error) {
                console.error('Registration failed:', error);
                alert('Registration failed due to an error.');
            }
        });
    }
    const cropProcessForm = document.getElementById('crop_process');
    if (cropProcessForm) {
        cropProcessForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(cropProcessForm);
            const farmers_id = formData.get('farmers_id');
            const crop = formData.get('crop');
            const process_type = formData.get('process_type');
            const process_date = formData.get('process_date');

            try {
                const response = await fetch('http://localhost:3000/api/Evaluation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        farmers_id, crop, process_type, process_date
                    }),
                });

                const data = await response.json();
                if (response.ok) {
                    alert('Crop process saved successfully!');
                } else {
                    alert(`Error: ${data.message}`);
                }
            } catch (error) {
                console.error('Error saving crop process:', error);
                alert('Error saving crop process. Please try again.');
            }
        });
    }
const feedbackForm = document.getElementById('feedback-form');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(feedbackForm);
            const status = formData.get('status');

            const response = await fetch('http://localhost:3000/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status }),
            });

            const data = await response.json();
            alert(data.message);
        });
    }
    const apiKey = 'e303728999f9d4a7a5ced20c22f4b71e';
    const fetchWeather = async (location) => {
        const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${apiKey}&units=metric`;
        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error('Weather information not available');
            }
            const weatherData = await response.json();
            console.log(weatherData);
            displayWeather(weatherData);
        } catch (error) {
            console.error('Error fetching weather:', error);
            displayErrorMessage();
        }
    };
function displayWeather(data) {
        if (data) {
            const temperature = data.main.temp;
            const windSpeed = data.wind.speed;
            const cloudCoverage = data.clouds.all;
            const pressure = data.main.pressure;
            const humidity = data.main.humidity;

            console.log(`Temperature: ${temperature} °C`);
            console.log(`Wind Speed: ${windSpeed} m/s`);
            console.log(`Cloud Coverage: ${cloudCoverage} %`);
            console.log(`Pressure: ${pressure} hPa`);

            const temperatureElement = document.getElementById('temperature');
            if (temperatureElement) {
                temperatureElement.innerText = `Temperature: ${temperature} °C`;
            } else {
                console.error('Temperature element not found');
            }

            const windElement = document.getElementById('wind');
            if (windElement) {
                windElement.innerText = `Wind Speed: ${windSpeed} m/s`;
            }

            const cloudsElement = document.getElementById('clouds');
            if (cloudsElement) {
                cloudsElement.innerText = `Cloud Coverage: ${cloudCoverage} %`;
            }

            const pressureElement = document.getElementById('pressure');
            if (pressureElement) {
                pressureElement.innerText = `Pressure: ${pressure} hPa`;
            }

            const crops = recommendCrops(temperature, humidity, windSpeed);
            displayRecommendedCrops(crops);
            showRecommendationContainer(); 
        } else {
            console.error('Weather data is missing:', data);
        }
    }

    const displayErrorMessage = () => {
        const weatherInfo = document.getElementById('weather-info');
        weatherInfo.textContent = 'Weather information not available. Please try again later.';
    };

    const showRecommendationContainer = () => {
        const recommendationContainer = document.querySelector('.recommendation-container');
        recommendationContainer.style.display = 'block'; 
    };

    const recommendCrops = (temperature, humidity, windSpeed) => {
        if (temperature <= 10 && humidity >= 70 && windSpeed < 5) {
            return ['Cabbage', 'Broccoli', 'Spinach'];
        } else if (temperature > 10 && temperature < 15 && humidity >= 60 && windSpeed < 6) {
            return ['Tomatoes', 'Beans', 'Peas'];
        } else if (temperature >= 15 && temperature < 20 && humidity >= 50 && windSpeed < 6) {
            return ['Broccoli', 'Lettuce', 'Peas', 'Spinach', 'Cabbage'];
        } else if (temperature >= 20 && temperature < 25 && humidity >= 45 && windSpeed < 7) {
            return ['Sorghum', 'Millet', 'Watermelon', 'Okra', 'Sweet Potatoes'];
        } else if (temperature >= 25 && temperature < 30 && humidity >= 40 && windSpeed < 8) {
            return ['Maize', 'Soy Beans', 'Tomatoes', 'Eggplant', 'Cucumbers', 'Peppers'];
        } else if (temperature >= 30 && temperature < 35 && humidity >= 35 && windSpeed < 9) {
            return ['Cotton', 'Peanuts', 'Pumpkin', 'Sunflower'];
        } else if (temperature >= 35 && humidity >= 30 && windSpeed < 10) {
            return ['Sesame', 'Coconut', 'Sesbania'];
        } else {
            return ['No specific recommendations for this weather condition'];
        }
    };

    const displayRecommendedCrops = (crops) => {
        const cropList = document.getElementById('cropList');
        cropList.innerHTML = '';

        crops.forEach(crop => {
            const cropItem = document.createElement('li');
            cropItem.textContent = crop;
            cropList.appendChild(cropItem);
        });
    };
    const fetchWeatherBtn = document.getElementById('fetchWeatherBtn');
    if (fetchWeatherBtn) {
        fetchWeatherBtn.addEventListener('click', function () {
            const locationInput = document.getElementById('location');
            if (locationInput && locationInput.value) {
                fetchWeather(locationInput.value);
            } else {
                alert('Please enter a city name.');
            }
        });
    }
    const farmersProcesses = {};
function displayCompletedProcesses(farmerId) {
    const tableBody = document.getElementById('completed_processes_table').getElementsByTagName('tbody')[0];
    const farmerProcesses = farmersProcesses[farmerId] || [];
    tableBody.innerHTML = '';
    farmerProcesses.forEach(process => {
        const row = tableBody.insertRow();
        const cell1 = row.insertCell(0);
        const cell2 = row.insertCell(1);
        const cell3 = row.insertCell(2);

        cell1.textContent = process.crop;
        cell2.textContent = process.processType;
        cell3.textContent = process.processDate;
    });
    document.getElementById('farmer-id-display').textContent = farmerId;
    document.getElementById('completed_processes_table').style.display = 'table';
}
document.getElementById('crop_process').addEventListener('submit', function(event) {
    event.preventDefault();
    const farmerId = document.getElementById('farmers_id').value;
    const crop = document.getElementById('crop').value;
    const processType = document.getElementById('process_type').value;
    const processDate = document.getElementById('process_date').value;
    if (!farmersProcesses[farmerId]) {
        farmersProcesses[farmerId] = [];
    }
    farmersProcesses[farmerId].push({ crop, processType, processDate });
});
document.getElementById('showProcessBtn').addEventListener('click', function() {
    const farmerId = document.getElementById('farmers_id').value;
    if (farmerId) {
        displayCompletedProcesses(farmerId); 
    } else {
        alert("Please enter a valid Farmer ID.");
        return;
    }
    fetch(`/api/Evaluation?farmers_id=${farmerId}`) 
        .then(response => response.json())
        .then(data => {
            if (data.exists) {
                displayProcesses(farmerId); 
            } else {
                alert("No processes found for the given Farmer ID.");
            }
        })
        .catch(error => {
            console.error('Error fetching processes:', error);
            alert("An error occurred while fetching the data.");
        });
});

function displayProcesses(farmerId) {
    fetch(`/api/get-processes?farmers_id=${farmerId}`) 
        .then(response => response.json())
        .then(data => {
            const tableBody = document.getElementById('completed_processes_table').getElementsByTagName('tbody')[0];
            const farmerIdDisplay = document.getElementById('farmer-id-display');
            farmerIdDisplay.textContent = farmerId;
            tableBody.innerHTML = '';
            if (data.processes.length === 0) {
                const row = tableBody.insertRow();
                const cell = row.insertCell(0);
                cell.colSpan = 3;
                cell.textContent = "No processes found.";
                return;
            }
            data.processes.forEach(process => {
                const row = tableBody.insertRow();
                row.insertCell(0).textContent = process.crop;
                row.insertCell(1).textContent = process.process_type;
                row.insertCell(2).textContent = process.process_date;
            });
            document.querySelector('.process-table').style.display = 'table';
        })
        .catch(error => {
            console.error('Error displaying processes:', error);
            alert("An error occurred while displaying the processes.");
        });
}
document.getElementById('sendBtn').addEventListener('click', async function() {
        const userMessage = document.getElementById('userMessage').value.trim(); 
        if (userMessage !== "") {
            const userMsgElement = document.createElement('p');
            userMsgElement.classList.add('user-msg');
            userMsgElement.textContent = userMessage;
            document.getElementById('chatbox-body').appendChild(userMsgElement);
            try {
                const response = await fetch('/api/diagnose-symptoms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ symptoms: userMessage })
                });
                const data = await response.json();
                
                const botResponse = document.createElement('p');
                botResponse.classList.add('bot-msg');
                if (data.disease) {
                    botResponse.textContent = `Disease: ${data.disease}\nRemedies: ${data.remedies.join(', ')}`;
                } else {
                    botResponse.textContent = data.message;
                }
                document.getElementById('chatbox-body').appendChild(botResponse);
            } catch (error) {
                console.error('Error:', error);
            }
            document.getElementById('userMessage').value = ""; 
        }
    });
    document.getElementById('uploadBtn').addEventListener('click', async function() {
        const imageInput = document.getElementById('imageInput');
        const formData = new FormData();
        formData.append('cropImage', imageInput.files[0]);

        const response = await fetch('/api/upload-image', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        const botResponse = document.createElement('p');
        botResponse.classList.add('bot-msg');
        botResponse.textContent = `Disease: ${data.disease}\nRemedies: ${data.remedies.join(', ')}`;
        document.getElementById('chatbox-body').appendChild(botResponse);
    });
  
});
document.addEventListener('DOMContentLoaded', () => {
    const showExpertsBtn = document.getElementById('showExpertsBtn');
    const expertProfiles = document.getElementById('expertProfiles');
    expertProfiles.style.display = 'none';
    showExpertsBtn.addEventListener('click', () => {
        if (expertProfiles.style.display === 'none') {
            expertProfiles.style.display = 'block';
        } else {
            expertProfiles.style.display = 'none';
        }
    });
});