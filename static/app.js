/**
 * AETHERTRANSLATE - Core Application Logic
 * Implements high-end UI interactivity, Speech-to-Text, Text-to-Speech,
 * localStorage history, and server API communication.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // DOM ELEMENTS
    // ==========================================================================
    
    // Core Layout
    const historyDrawer = document.getElementById('historyDrawer');
    const toggleHistoryBtn = document.getElementById('toggleHistoryBtn');
    const closeDrawerBtn = document.getElementById('closeDrawerBtn');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    // Inputs & Selectors
    const appLayout = document.querySelector('.app-layout');
    const sourceText = document.getElementById('sourceText');
    const targetText = document.getElementById('targetText');
    const sourceLang = document.getElementById('sourceLang');
    const targetLang = document.getElementById('targetLang');
    const swapLanguagesBtn = document.getElementById('swapLanguagesBtn');
    
    // Controls & Settings
    const voiceTypingBtn = document.getElementById('voiceTypingBtn');
    const voiceWaveform = document.getElementById('voiceWaveform');
    const speakTranslationBtn = document.getElementById('speakTranslationBtn');
    const autoTranslateToggle = document.getElementById('autoTranslateToggle');
    const manualTranslateBtn = document.getElementById('manualTranslateBtn');
    
    // Actions
    const clearTextBtn = document.getElementById('clearTextBtn');
    const copySourceBtn = document.getElementById('copySourceBtn');
    const copyTargetBtn = document.getElementById('copyTargetBtn');
    const favoriteBtn = document.getElementById('favoriteBtn');
    
    // Loading & Badges
    const loadingOverlay = document.getElementById('loadingOverlay');
    const engineBadge = document.getElementById('engineBadge');
    const voiceStatusNote = document.getElementById('voiceStatusNote');
    const sampleButtons = document.querySelectorAll('.sample-chip');
    
    // History Drawer elements
    const historyList = document.getElementById('historyList');
    const historySearch = document.getElementById('historySearch');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    
    // Metrics
    const charCount = document.getElementById('charCount');
    const wordCount = document.getElementById('wordCount');
    const speedMetric = document.getElementById('speedMetric');
    const networkMode = document.getElementById('networkMode');

    // ==========================================================================
    // STATE VARIABLES
    // ==========================================================================
    let translationTimeout = null;
    let isSpeechSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    let recognition = null;
    let isListening = false;
    let isTranslating = false;
    let restartTimer = null;
    // When user explicitly stops listening we honor it; otherwise we auto-restart
    let userRequestedStop = false;
    let historyData = JSON.parse(localStorage.getItem('aether_translation_history')) || [];

    const samplePhrases = {
        en: "Hello, how are you today?",
        hi: "नमस्ते, आप आज कैसे हैं?",
        ta: "வணக்கம், நீங்கள் இன்று எப்படி இருக்கிறீர்கள்?",
        te: "హలో, మీరు ఈ రోజు ఎలా ఉన్నారు?",
        es: "Hola, ¿cómo estás hoy?",
        fr: "Bonjour, comment allez-vous aujourd'hui?"
    };

    // ==========================================================================
    // INITIALIZATION & STATS STATUS
    // ==========================================================================
    
    // Update active indicators and status dot
    networkMode.innerText = navigator.onLine ? "Online" : "Offline";
    window.addEventListener('online', () => { networkMode.innerText = "Online"; });
    window.addEventListener('offline', () => { networkMode.innerText = "Offline"; });
    
    // Initialize history display
    renderHistory();
    checkBackendStatus();
    voiceStatusNote.textContent = 'Click the mic, allow microphone access, and speak in the selected source language.';
    voiceStatusNote.className = 'voice-support-note';
    
    // Check status every 7 seconds to update backend engine loading progress
    const statusInterval = setInterval(checkBackendStatus, 7000);

    // ==========================================================================
    // SPEECH RECOGNITION (SPEECH-TO-TEXT)
    // ==========================================================================
    if (isSpeechSupported) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 3;
        
        recognition.onstart = () => {
            isListening = true;
            voiceTypingBtn.classList.add('active');
            voiceWaveform.classList.add('active');
            voiceStatusNote.textContent = 'Listening... Speak clearly in the selected source language.';
            voiceStatusNote.className = 'voice-support-note';
            sourceText.placeholder = "";
            // user initiated listening; ensure auto-restart remains enabled until they stop
            userRequestedStop = false;
        };

        recognition.onspeechstart = () => {
            voiceStatusNote.textContent = 'Speech detected. Continue speaking...';
        };

        recognition.onspeechend = () => {
            voiceStatusNote.textContent = 'Processing your speech fragment...';
        };

        recognition.onend = () => {
            isListening = false;
            voiceTypingBtn.classList.remove('active');
            voiceWaveform.classList.remove('active');
            if (sourceText.value.trim() === "") {
                sourceText.placeholder = "Enter text or click microphone for voice typing...";
            }
            if (!userRequestedStop) {
                voiceStatusNote.textContent = 'Auto-resuming voice capture after pause...';
                scheduleRecognitionRestart(700);
            }
        };

        recognition.onerror = (event) => {
            const errorMessage = event.error === 'not-allowed' || event.error === 'permission-denied'
                ? 'Microphone permission denied. Allow microphone access and retry.'
                : event.error === 'no-speech' || event.error === 'audio-capture'
                    ? 'Audio not captured. Retrying voice recognition...' 
                    : 'Speech recognition error: ' + event.error;
            voiceStatusNote.textContent = errorMessage;
            voiceStatusNote.className = event.error === 'not-allowed' || event.error === 'permission-denied'
                ? 'voice-support-note error'
                : 'voice-support-note warning';
            console.error('Speech Recognition Error:', event.error);
            if (event.error === 'not-allowed' || event.error === 'permission-denied') {
                userRequestedStop = true;
                stopVoiceTyping();
                return;
            }
            if (!userRequestedStop) {
                scheduleRecognitionRestart(1200);
            }
        };
        
        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalPieces = [];

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const result = event.results[i];
                if (result.isFinal) {
                    // choose best alternative by confidence when available
                    let bestAlt = result[0];
                    for (let a = 1; a < result.length; a++) {
                        if (typeof result[a].confidence === 'number' && typeof bestAlt.confidence === 'number') {
                            if (result[a].confidence > bestAlt.confidence) bestAlt = result[a];
                        } else if (result[a].transcript.length > bestAlt.transcript.length) {
                            bestAlt = result[a];
                        }
                    }
                    finalPieces.push(bestAlt.transcript.trim());
                } else {
                    interimTranscript += result[0].transcript;
                }
            }

            if (interimTranscript !== '') {
                voiceStatusNote.textContent = `Heard: ${interimTranscript}`;
            }

            if (finalPieces.length > 0) {
                const finalTranscript = finalPieces.join(' ');
                const processed = postProcessTranscript(finalTranscript);
                const textToAdd = sourceText.value ? ' ' + processed : processed;
                sourceText.value += textToAdd;
                updateStats();
                triggerAutoTranslate();
                voiceStatusNote.textContent = 'Captured: ' + processed;
            }
        };
    } else {
        voiceTypingBtn.style.display = 'none';
        voiceStatusNote.textContent = 'Microphone speech input is not available in this browser. Use Chrome or Edge with microphone access enabled.';
        voiceStatusNote.className = 'voice-support-note warning';
        console.log("Speech recognition not supported in this browser.");
    }

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices().then(devices => {
            const hasMic = devices.some(device => device.kind === 'audioinput');
            if (!hasMic) {
                voiceStatusNote.textContent = 'No microphone found on this system. Connect a microphone and refresh the page.';
                voiceStatusNote.className = 'voice-support-note warning';
            }
        }).catch(() => {
            // Ignore enumeration errors, fallback to browser permission check.
        });
    }

    function scheduleRecognitionRestart(delay = 700) {
        if (!recognition || userRequestedStop) return;
        clearTimeout(restartTimer);
        restartTimer = setTimeout(() => {
            if (!recognition || isListening || userRequestedStop) return;
            try {
                recognition.start();
            } catch (e) {
                console.warn('Recognition restart failed, retrying:', e);
                scheduleRecognitionRestart(Math.min(delay + 300, 2000));
            }
        }, delay);
    }

    function startVoiceTyping() {
        if (!recognition || isListening) return;
        
        // Match speech recognition language with selected source language
        const langMap = {
            'en': 'en-US',
            'hi': 'hi-IN',
            'ta': 'ta-IN',
            'te': 'te-IN',
            'es': 'es-ES',
            'fr': 'fr-FR'
        };
        recognition.lang = langMap[sourceLang.value] || 'en-US';
        
        try {
            userRequestedStop = false;
            clearTimeout(restartTimer);
            voiceStatusNote.textContent = 'Starting voice capture...';
            recognition.start();
        } catch (e) {
            console.error("Failed to start voice typing:", e);
            scheduleRecognitionRestart(1000);
        }
    }

    function stopVoiceTyping() {
        if (!recognition) return;
        try {
            userRequestedStop = true;
            clearTimeout(restartTimer);
            recognition.stop();
        } catch (e) {
            console.error("Failed to stop voice typing:", e);
        }
    }

    voiceTypingBtn.addEventListener('click', () => {
        if (isListening) {
            stopVoiceTyping();
        } else {
            startVoiceTyping();
        }
    });

    sampleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const lang = button.dataset.lang;
            if (!lang || !samplePhrases[lang]) return;
            sourceLang.value = lang;
            sourceText.value = samplePhrases[lang];
            updateStats();
            voiceStatusNote.textContent = `Sample phrase loaded for ${button.textContent}. Press translate or speak this phrase clearly.`;
            voiceStatusNote.className = 'voice-support-note';
            performTranslation();
        });
    });

    // ==========================================================================
    // TEXT-TO-SPEECH (SPEECH SYNTHESIS)
    // ==========================================================================
    speakTranslationBtn.addEventListener('click', () => {
        const textToSpeak = targetText.textContent;
        if (!textToSpeak || targetText.classList.contains('placeholder')) return;
        
        // Stop current synthesis if speaking
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            speakTranslationBtn.classList.remove('active');
            return;
        }
        
        speakTranslationBtn.classList.add('active');
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        
        // Select an appropriate voice based on target language
        const langMap = {
            'en': 'en-US',
            'hi': 'hi-IN',
            'ta': 'ta-IN',
            'te': 'te-IN',
            'es': 'es-ES',
            'fr': 'fr-FR'
        };
        utterance.lang = langMap[targetLang.value] || 'en-US';
        
        utterance.onend = () => {
            speakTranslationBtn.classList.remove('active');
        };
        
        utterance.onerror = () => {
            speakTranslationBtn.classList.remove('active');
        };
        
        window.speechSynthesis.speak(utterance);
    });

    // ==========================================================================
    // TRANSLATION API REQUEST
    // ==========================================================================
    async function performTranslation() {
        if (isTranslating) return;
        const text = sourceText.value.trim();
        
        if (!text) {
            targetText.textContent = "Translation will appear here...";
            targetText.classList.add('placeholder');
            favoriteBtn.querySelector('i').className = 'fa-regular fa-star';
            return;
        }

        isTranslating = true;
        manualTranslateBtn.disabled = true;
        manualTranslateBtn.classList.add('disabled');
        loadingOverlay.classList.add('active');
        const startTime = performance.now();

        try {
            const payloadText = normalizeForTranslation(text);
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                        text: payloadText,
                    source_lang: sourceLang.value,
                    target_lang: targetLang.value
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Update translation result
            targetText.textContent = data.translated_text || '';
            targetText.classList.remove('placeholder');
            
            // Set engine badge metadata
            engineBadge.innerHTML = `<i class="fa-solid fa-microchip"></i> Engine: ${data.engine}`;
            
            // Update performance speed metric
            const elapsed = Math.round(performance.now() - startTime);
            speedMetric.innerText = `${elapsed}ms`;
            
            // Reset favorite button star icon since text changed
            favoriteBtn.querySelector('i').className = 'fa-regular fa-star';
            
            // Proactively trigger status check to see if models finished loading
            checkBackendStatus();

        } catch (error) {
            console.error('Translation Error:', error);
            targetText.textContent = `[Service Unavailable: Make sure your Flask backend server is running.]`;
            targetText.classList.add('placeholder');
            engineBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Connection Failed`;
        } finally {
            isTranslating = false;
            manualTranslateBtn.disabled = false;
            manualTranslateBtn.classList.remove('disabled');
            loadingOverlay.classList.remove('active');
        }
    }

    function triggerAutoTranslate() {
        if (!autoTranslateToggle.checked) return;
        
        if (translationTimeout) {
            clearTimeout(translationTimeout);
        }
        
        translationTimeout = setTimeout(() => {
            performTranslation();
        }, 800); // 800ms debounce
    }

    // Manual translation button trigger
    manualTranslateBtn.addEventListener('click', performTranslation);

    // ==========================================================================
    // BACKEND ENGINE STATUS POLLING
    // ==========================================================================
    async function checkBackendStatus() {
        try {
            const response = await fetch('/api/status');
            if (response.ok) {
                const data = await response.json();
                
                // Update Status Indicator DOT and TEXT
                if (data.status === 'loaded') {
                    statusDot.className = 'status-dot active';
                    statusText.innerText = "Transformer Local (Offline)";
                    // Swap status dot glow
                } else if (data.status === 'loading') {
                    statusDot.className = 'status-dot pulsing';
                    statusText.innerText = "Downloading Local Models...";
                } else if (data.status === 'failed') {
                    statusDot.className = 'status-dot error';
                    statusText.innerText = "Cloud Mode (Resource Limits)";
                } else {
                    statusDot.className = 'status-dot fallback';
                    statusText.innerText = "Cloud API Enabled";
                }
            } else {
                setBackendOffline();
            }
        } catch (e) {
            setBackendOffline();
        }
    }

    function setBackendOffline() {
        statusDot.className = 'status-dot error';
        statusText.innerText = "Backend Offline";
    }

    // ==========================================================================
    // LOCAL HISTORY STORAGE AND RENDER
    // ==========================================================================
    
    // Save active translation pair to history (Favorite star click)
    favoriteBtn.addEventListener('click', () => {
        const sourceVal = sourceText.value.trim();
        const targetVal = targetText.textContent;
        const sLang = sourceLang.value;
        const tLang = targetLang.value;

        if (!sourceVal || targetText.classList.contains('placeholder')) return;

        // Check if already in history
        const exists = historyData.some(item => 
            item.sourceText.toLowerCase() === sourceVal.toLowerCase() && 
            item.sourceLang === sLang && 
            item.targetLang === tLang
        );

        const starIcon = favoriteBtn.querySelector('i');

        if (!exists) {
            // Add to front of array
            const historyItem = {
                id: Date.now().toString(),
                sourceText: sourceVal,
                targetText: targetVal,
                sourceLang: sLang,
                targetLang: tLang,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            
            historyData.unshift(historyItem);
            localStorage.setItem('aether_translation_history', JSON.stringify(historyData));
            
            starIcon.className = 'fa-solid fa-star';
            starIcon.style.color = 'var(--accent-warning)';
            
            // Pulse standard notification toast or feedback
            renderHistory();
        } else {
            // Remove from history
            historyData = historyData.filter(item => 
                !(item.sourceText.toLowerCase() === sourceVal.toLowerCase() && 
                  item.sourceLang === sLang && 
                  item.targetLang === tLang)
            );
            localStorage.setItem('aether_translation_history', JSON.stringify(historyData));
            
            starIcon.className = 'fa-regular fa-star';
            starIcon.style.color = '';
            
            renderHistory();
        }
    });

    function renderHistory() {
        const filterText = historySearch.value.toLowerCase().trim();
        
        const filteredHistory = historyData.filter(item => 
            item.sourceText.toLowerCase().includes(filterText) ||
            item.targetText.toLowerCase().includes(filterText)
        );

        if (filteredHistory.length === 0) {
            historyList.innerHTML = `
                <div class="empty-history">
                    <i class="fa-regular fa-folder-open"></i>
                    <p>${filterText ? 'No search results found.' : 'No translation history yet.'}</p>
                </div>
            `;
            return;
        }

        historyList.innerHTML = '';
        
        filteredHistory.forEach(item => {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.dataset.id = item.id;
            
            card.innerHTML = `
                <div class="history-card-header">
                    <span class="history-card-lang">${item.sourceLang.toUpperCase()} → ${item.targetLang.toUpperCase()}</span>
                    <span>${item.timestamp}</span>
                </div>
                <div class="history-card-text">${escapeHtml(item.sourceText)}</div>
                <div class="history-card-translation">${escapeHtml(item.targetText)}</div>
                <button class="history-card-delete" title="Delete record" aria-label="Delete history record">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            
            // Click card to restore translation
            card.addEventListener('click', (e) => {
                // If clicked delete button, skip restoring
                if (e.target.closest('.history-card-delete')) return;
                
                sourceLang.value = item.sourceLang;
                targetLang.value = item.targetLang;
                sourceText.value = item.sourceText;
                
                // Perform translation to update visual badges
                targetText.textContent = item.targetText;
                targetText.classList.remove('placeholder');
                
                favoriteBtn.querySelector('i').className = 'fa-solid fa-star';
                favoriteBtn.querySelector('i').style.color = 'var(--accent-warning)';
                
                updateStats();
                
                // On mobile, close history drawer upon restore
                if (window.innerWidth < 1200) {
                    historyDrawer.classList.remove('open');
                }
            });
            
            // Delete translation item trigger
            const delBtn = card.querySelector('.history-card-delete');
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteHistoryItem(item.id);
            });
            
            historyList.appendChild(card);
        });
    }

    function deleteHistoryItem(id) {
        historyData = historyData.filter(item => item.id !== id);
        localStorage.setItem('aether_translation_history', JSON.stringify(historyData));
        
        // If current display matches deleted item, un-star the button
        const sourceVal = sourceText.value.trim();
        if (sourceVal) {
            const stillExists = historyData.some(item => 
                item.sourceText.toLowerCase() === sourceVal.toLowerCase() && 
                item.sourceLang === sourceLang.value && 
                item.targetLang === targetLang.value
            );
            if (!stillExists) {
                favoriteBtn.querySelector('i').className = 'fa-regular fa-star';
                favoriteBtn.querySelector('i').style.color = '';
            }
        }
        
        renderHistory();
    }

    // Filter history inputs
    historySearch.addEventListener('input', renderHistory);

    // Clear whole history database
    clearHistoryBtn.addEventListener('click', () => {
        if (historyData.length === 0) return;
        
        if (confirm("Are you sure you want to permanently clear your translation history?")) {
            historyData = [];
            localStorage.removeItem('aether_translation_history');
            favoriteBtn.querySelector('i').className = 'fa-regular fa-star';
            favoriteBtn.querySelector('i').style.color = '';
            renderHistory();
        }
    });

    // Toggle and Close sidebar
    toggleHistoryBtn.addEventListener('click', () => {
        historyDrawer.classList.toggle('open');
        appLayout.classList.toggle('history-open');
    });
    
    closeDrawerBtn.addEventListener('click', () => {
        historyDrawer.classList.remove('open');
        appLayout.classList.remove('history-open');
    });

    // ==========================================================================
    // UTILITIES AND CORE EVENTS
    // ==========================================================================
    // Post-process speech transcripts: normalize spacing, punctuation, capitalization
    function postProcessTranscript(text) {
        if (!text) return '';
        let t = text.replace(/\s+/g, ' ').trim();
        // Add terminal punctuation if missing
        if (!/[\.\!\?]$/.test(t)) {
            t = t + '.';
        }
        // Capitalize first letter
        t = t.charAt(0).toUpperCase() + t.slice(1);
        return t;
    }

    function normalizeForTranslation(text) {
        if (!text) return '';
        // Collapse whitespace and ensure punctuation to improve model input quality
        let t = text.replace(/\s+/g, ' ').trim();
        if (!/[\.\!\?]$/.test(t)) t = t + '.';
        return t;
    }
    
    // Character and Word Counter
    function updateStats() {
        const text = sourceText.value;
        charCount.innerText = text.length;
        
        const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
        wordCount.innerText = words;
    }

    sourceText.addEventListener('input', () => {
        updateStats();
        triggerAutoTranslate();
    });

    // Clear Text Action
    clearTextBtn.addEventListener('click', () => {
        sourceText.value = "";
        targetText.textContent = "Translation will appear here...";
        targetText.classList.add('placeholder');
        favoriteBtn.querySelector('i').className = 'fa-regular fa-star';
        favoriteBtn.querySelector('i').style.color = '';
        updateStats();
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
    });

    // Copy to Clipboard Helpers
    function copyToClipboard(text, buttonElement) {
        if (!text || text.includes("will appear here...")) return;
        
        navigator.clipboard.writeText(text).then(() => {
            const originalIconClass = buttonElement.querySelector('i').className;
            
            // Visually transform icon to success checkmark
            buttonElement.querySelector('i').className = 'fa-solid fa-circle-check';
            buttonElement.querySelector('i').style.color = 'var(--accent-success)';
            
            setTimeout(() => {
                buttonElement.querySelector('i').className = originalIconClass;
                buttonElement.querySelector('i').style.color = '';
            }, 1500);
        }).catch(err => {
            console.error('Failed to copy to clipboard:', err);
        });
    }

    copySourceBtn.addEventListener('click', () => {
        copyToClipboard(sourceText.value, copySourceBtn);
    });

    copyTargetBtn.addEventListener('click', () => {
        copyToClipboard(targetText.textContent, copyTargetBtn);
    });

    // Swap Languages action
    swapLanguagesBtn.addEventListener('click', () => {
        const tempLang = sourceLang.value;
        const tempText = sourceText.value;
        
        sourceLang.value = targetLang.value;
        targetLang.value = tempLang;
        
        // Swap values
        sourceText.value = targetText.classList.contains('placeholder') ? "" : targetText.textContent;
        targetText.textContent = tempText ? tempText : "Translation will appear here...";
        
        if (targetText.textContent === "Translation will appear here...") {
            targetText.classList.add('placeholder');
        } else {
            targetText.classList.remove('placeholder');
        }
        
        updateStats();
        
        // Perform quick translation update if text exists
        if (sourceText.value.trim() !== "") {
            performTranslation();
        }
    });

    // If dropdowns change languages, re-translate if text present
    sourceLang.addEventListener('change', () => {
        if (sourceText.value.trim() !== "") {
            performTranslation();
        }
    });
    
    targetLang.addEventListener('change', () => {
        if (sourceText.value.trim() !== "") {
            performTranslation();
        }
    });

    // Escape HTML strings for safe innerHTML injection
    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }
});
