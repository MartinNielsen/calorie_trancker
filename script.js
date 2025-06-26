
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

    async function parseTextWithGemini(text) {
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${geminiApiKey}`;
        const prompt = `Extract the food name and weight in grams from the following text: "${text}". Respond with a JSON object like {"food": "...", "weight": ...}. If you cannot determine the food or weight, respond with {"error": "Could not parse"}.`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
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

    function handleVoiceResult(text) {
        parseTextWithGemini(text).then(result => {
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

    talkButton.addEventListener('click', () => {
        if (!SpeechRecognition) {
            alert('Speech recognition is not supported in your browser.');
            return;
        }
        if (talkButton.classList.contains('recording')) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });

    if (SpeechRecognition) {
        recognition.onstart = () => {
            talkButton.classList.add('recording');
        };

        recognition.onend = () => {
            talkButton.classList.remove('recording');
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            handleVoiceResult(transcript);
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
});
