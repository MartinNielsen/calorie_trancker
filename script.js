
document.addEventListener('DOMContentLoaded', () => {
    const apiKeyModal = document.getElementById('api-key-modal');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyButton = document.getElementById('save-api-key');
    const appContainer = document.getElementById('app-container');
    const totalCaloriesDisplay = document.getElementById('total-calories');
    const foodList = document.getElementById('food-list');
    const talkButton = document.getElementById('talk-button');
    const newFoodModal = document.getElementById('new-food-modal');
    const newFoodNameDisplay = document.getElementById('new-food-name');
    const newFoodCaloriesInput = document.getElementById('new-food-calories');
    const saveNewFoodButton = document.getElementById('save-new-food');
    const cancelNewFoodButton = document.getElementById('cancel-new-food');

    let currentVoiceHandler = null;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
    }

    let geminiApiKey = localStorage.getItem('geminiApiKey');
    let foodDb = JSON.parse(localStorage.getItem('foodDb')) || {};
    let dailyLog = JSON.parse(localStorage.getItem(getDailyLogKey())) || [];

    function getDailyLogKey() {
        const now = new Date();
        return `dailyLog_${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    }

    function checkApiKey() {
        if (!geminiApiKey) {
            apiKeyModal.classList.add('active');
        } else {
            appContainer.style.display = 'flex';
        }
    }

    function saveApiKey() {
        geminiApiKey = apiKeyInput.value.trim();
        if (geminiApiKey) {
            localStorage.setItem('geminiApiKey', geminiApiKey);
            apiKeyModal.classList.remove('active');
            appContainer.style.display = 'flex';
        }
    }

    async function parseTextWithGemini(text, prompt) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${geminiApiKey}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt.replace('${text}', text) }] }]
                }),
            });

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.statusText}`);
            }

            const data = await response.json();
            const jsonString = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('Error calling Gemini API:', error);
            alert('Could not process your request. Please check your API key and network connection.');
            return { error: 'API call failed' };
        }
    }

    function addFoodToLog(food, weight, calories) {
        const entry = {
            id: Date.now(),
            food,
            weight,
            calories
        };
        dailyLog.push(entry);
        localStorage.setItem(getDailyLogKey(), JSON.stringify(dailyLog));
        renderDailyLog();
    }

    function handleFoodVoiceResult(text) {
        const prompt = `Extract the food name and weight in grams from the following text: "${text}". Respond with a JSON object like {"food": "...", "weight": ...}. If you cannot determine the food or weight, respond with {"error": "Could not parse"}.`;
        parseTextWithGemini(text, prompt).then(result => {
            if (result.error || !result.food || !result.weight) {
                alert("Sorry, I couldn't understand the food and weight.");
                return;
            }

            const food = result.food.toLowerCase();
            const weight = result.weight;

            if (foodDb[food]) {
                const caloriesPer100g = foodDb[food];
                const calculatedCalories = (weight / 100) * caloriesPer100g;
                addFoodToLog(result.food, weight, Math.round(calculatedCalories));
            } else {
                promptForNewFood(result.food, weight);
            }
        });
    }

    function handleCalorieVoiceResult(text) {
        const prompt = `Extract the calorie amount from the following text: "${text}". Respond with a JSON object like {"calories": ...}. If you cannot determine the number, respond with {"error": "Could not parse"}.`;
        parseTextWithGemini(text, prompt).then(result => {
            if (result.error || !result.calories) {
                alert("Sorry, I couldn't understand the calorie amount.");
                return;
            }
            newFoodCaloriesInput.value = result.calories;
        });
    }
    
    function promptForNewFood(foodName, weight) {
        newFoodNameDisplay.textContent = foodName;
        newFoodCaloriesInput.value = '';
        newFoodModal.classList.add('active');

        saveNewFoodButton.onclick = () => {
            const caloriesPer100g = parseInt(newFoodCaloriesInput.value, 10);
            if (caloriesPer100g > 0) {
                foodDb[foodName.toLowerCase()] = caloriesPer100g;
                localStorage.setItem('foodDb', JSON.stringify(foodDb));
                
                const calculatedCalories = (weight / 100) * caloriesPer100g;
                addFoodToLog(foodName, weight, Math.round(calculatedCalories));

                newFoodModal.classList.remove('active');
            } else {
                alert('Please enter a valid calorie amount.');
            }
        };

        cancelNewFoodButton.onclick = () => {
            newFoodModal.classList.remove('active');
            newFoodCaloriesInput.value = '';
            newFoodNameDisplay.textContent = '';
        };
    }

    function deleteFoodItem(id) {
        dailyLog = dailyLog.filter(item => item.id !== id);
        localStorage.setItem(getDailyLogKey(), JSON.stringify(dailyLog));
        renderDailyLog();
    }

    function renderDailyLog() {
        foodList.innerHTML = '';
        let totalCalories = 0;
        dailyLog.forEach(item => {
            const li = document.createElement('li');
            li.className = 'food-item';
            li.innerHTML = `
                <div class="food-item-details">
                    <span class="food-item-name">${item.food}</span>
                    <div class="food-item-info">${item.weight}g - ${item.calories} kcal</div>
                </div>
                <button class="delete-btn" data-id="${item.id}">&times;</button>
            `;
            foodList.appendChild(li);
            totalCalories += item.calories;
        });
        totalCaloriesDisplay.textContent = totalCalories;
    }

    function startVoiceRecognition(handler, button) {
        if (!SpeechRecognition) {
            alert('Speech recognition is not supported in your browser.');
            return;
        }

        if (recognition.recognizing) {
            recognition.stop();
        } else {
            currentVoiceHandler = handler;
            recognition.start();
        }
    }

    talkButton.addEventListener('click', () => {
        if (newFoodModal.classList.contains('active')) {
            startVoiceRecognition(handleCalorieVoiceResult, talkButton);
        } else {
            startVoiceRecognition(handleFoodVoiceResult, talkButton);
        }
    });

    if (SpeechRecognition) {
        recognition.onstart = () => {
            talkButton.classList.add('recording');
        };

        recognition.onend = () => {
            talkButton.classList.remove('recording');
            currentVoiceHandler = null;
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (currentVoiceHandler) {
                currentVoiceHandler(transcript);
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            alert(`Error in speech recognition: ${event.error}`);
        };
    }

    foodList.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const id = parseInt(e.target.getAttribute('data-id'), 10);
            deleteFoodItem(id);
        }
    });

    saveApiKeyButton.addEventListener('click', saveApiKey);

    checkApiKey();
    renderDailyLog();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            }).catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
        });
    }
});
