document.addEventListener('DOMContentLoaded', () => {
    let speedSlider = document.getElementById('speedSlider');
    let volumeSlider = document.getElementById('volumeSlider');
    let selectTTS = document.getElementById('engineSelect');

    // Add event listeners to the sliders
    speedSlider.addEventListener('input', handleSpeedChange);
    volumeSlider.addEventListener('input', handleVolumeChange);

    // Add event listener to the TTS engine change
    selectTTS.addEventListener('change', handleTTSvoiceChange);

    // Retrieve the stored speechSettings from extension storage
    chrome.storage.local
        .get('speechSettings', result => {
            if (result.speechSettings) {
                // Set the slider values based on the stored speechSettings
                speedSlider.value = result.speechSettings.speechSpeed;
                volumeSlider.value = result.speechSettings.speechVolume;

                selectTTS.value = result.speechSettings.speechVoice;
            }
        });

    chrome.runtime.lastError ? console.error('Error retrieving speech settings:', chrome.runtime.lastError) : null;


    // Function to handle speed slider change
    function handleSpeedChange(event) {
        // Perform actions with the speed value
        speechSettings.speechSpeed = parseFloat(event.target.value);
        saveSpeechSettings();
    }

    // Function to handle volume slider change
    function handleVolumeChange(event) {
        // Perform actions with the volume value
        speechSettings.speechVolume = parseFloat(event.target.value);
        saveSpeechSettings();
    }

    // Function to handle TTS voice change
    function handleTTSvoiceChange(event) {
        // Perform actions with the volume value
        speechSettings.speechVoice = event.target.value;
        saveSpeechSettings();
    }

    // Function to save the speech settings in extension storage
    function saveSpeechSettings() {
        chrome.storage.local.set({ speechSettings: speechSettings });
    }

    function fetchVoices() {
        return new Promise((resolve, reject) => {
            const speechSynthesis = window.speechSynthesis;

            // Check if voices are already available
            if (speechSynthesis.getVoices().length > 0) {
                resolve(speechSynthesis.getVoices());
            } else {
                // Wait for voices to be loaded
                speechSynthesis.onvoiceschanged = () => {
                    resolve(speechSynthesis.getVoices());
                };
            }
        });
    }

    // Function to populate the TTS engines dropdown
    function populateTTSEngines() {
        const select = document.getElementById('engineSelect');
        select.innerHTML = '';

        if ('speechSynthesis' in window) {
            fetchVoices()
                .then(voices => {
                    const select = document.getElementById('engineSelect');

                    if (select) {
                        // Clear the existing options
                        select.innerHTML = '';

                        voices.forEach(voice => {
                            const option = document.createElement('option');
                            option.text = voice.name;
                            option.value = voice.voiceURI;
                            select.add(option);
                        });

                        // Set the selected value based on stored speechSettings
                        if (speechSettings && speechSettings.speechVoice) {
                            select.value = speechSettings.speechVoice;
                        } else {
                            select.value = null;
                        }

                    } else {
                        throw new Error('Failed to find the engine select element');
                    }
                })
                .catch(error => {
                    console.error('Failed to fetch voices:', error);
                });
        } else {
            const option = document.createElement('option');
            option.text = 'TTS not supported';
            option.disabled = true;
            select.add(option);
        }
    }

    // Call the function to populate the TTS engines dropdown
    populateTTSEngines();
});

// Retrieve the speech settings from extension storage on startup
chrome.storage.local
    .get('speechSettings', result => {
        if (result.speechSettings) {
            speechSettings = result.speechSettings;
        } else {
            // Initialize speechSettings if it doesn't exist in storage
            speechSettings = {
                speechSpeed: 1.6,
                speechVolume: 1.0,
                speechVoice: null
            };
        }
    });