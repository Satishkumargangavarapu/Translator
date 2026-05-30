import requests
import json
import sys
import io

# Force console output to UTF-8 to display Hindi, Tamil, and Telugu characters perfectly on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

url = "http://127.0.0.1:5000/api/translate"

test_cases = [
    # English to Indic Languages
    {
        "description": "English to Hindi",
        "text": "Hello my friend, how are you? Welcome to our translation application.",
        "source_lang": "en",
        "target_lang": "hi"
    },
    {
        "description": "English to Tamil",
        "text": "Hello my friend, how are you? Welcome to our translation application.",
        "source_lang": "en",
        "target_lang": "ta"
    },
    {
        "description": "English to Telugu",
        "text": "Hello my friend, how are you? Welcome to our translation application.",
        "source_lang": "en",
        "target_lang": "te"
    },
    
    # Indic Languages to English
    {
        "description": "Hindi to English",
        "text": "नमस्ते मेरे दोस्त, आप कैसे हैं? हमारे अनुवाद अनुप्रयोग में आपका स्वागत है।",
        "source_lang": "hi",
        "target_lang": "en"
    },
    {
        "description": "Tamil to English",
        "text": "வணக்கம் என் நண்பா, நீங்கள் எப்படி இருக்கிறீர்கள்? எங்கள் மொழிபெயர்ப்பு பயன்பாட்டிற்கு உங்களை வரவேற்கிறோம்.",
        "source_lang": "ta",
        "target_lang": "en"
    },
    {
        "description": "Telugu to English",
        "text": "నమస్కారం నా స్నేహితుడా, మీరు ఎలా ఉన్నారు? మా అనువాద అనువర్తనానికి మీకు స్వాగతం.",
        "source_lang": "te",
        "target_lang": "en"
    },
    
    # Indic to Indic Languages (Direct translation)
    {
        "description": "Hindi to Tamil",
        "text": "आप कहाँ जा रहे हैं?",
        "source_lang": "hi",
        "target_lang": "ta"
    },
    {
        "description": "Tamil to Telugu",
        "text": "இன்று வானிலை மிகவும் நன்றாக இருக்கிறது.",
        "source_lang": "ta",
        "target_lang": "te"
    }
]

print("======================================================================")
print("             AETHERTRANSLATE MULTILINGUAL VALIDATION SUITE           ")
print("             Testing English, Hindi, Tamil, and Telugu              ")
print("======================================================================\n")

passed_cases = 0

for i, test in enumerate(test_cases, 1):
    print(f"[{i}] Test Case: {test['description']} ({test['source_lang']} → {test['target_lang']})")
    print(f"    Input  : {test['text']}")
    
    try:
        response = requests.post(url, json={
            "text": test["text"],
            "source_lang": test["source_lang"],
            "target_lang": test["target_lang"]
        })
        
        if response.status_code == 200:
            result = response.json()
            translated_text = result.get("translated_text", "").strip()
            engine = result.get("engine", "Unknown")
            
            if translated_text:
                print(f"    Output : {translated_text}")
                print(f"    Engine : {engine}")
                print(f"    Status : ✅ PASSED")
                passed_cases += 1
            else:
                print(f"    Status : ❌ FAILED (Empty translation returned)")
        else:
            print(f"    Status : ❌ FAILED (HTTP Status Code: {response.status_code})")
    except Exception as e:
        print(f"    Status : ❌ FAILED (Error connecting to server: {str(e)})")
    print("-" * 70 + "\n")

print("======================================================================")
print(f" Validation Summary: {passed_cases}/{len(test_cases)} Test Cases Passed")
print("======================================================================\n")
