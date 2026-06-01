import os
import threading
import time
import mimetypes
import logging
import traceback
from flask import Flask, request, jsonify
from deep_translator import GoogleTranslator

# Force correct MIME types for Windows registry compatibility (solves CSS MIME-type blocker)
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/javascript', '.js')

app = Flask(__name__, static_folder='static', static_url_path='')

# Configure logging for diagnostics
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

# Model configuration and supported languages
EN_HI_MODEL = "Helsinki-NLP/opus-mt-en-hi"
HI_EN_MODEL = "Helsinki-NLP/opus-mt-hi-en"

LANGUAGE_LABELS = {
    'auto': 'Auto Detect',
    'en': 'English',
    'hi': 'Hindi',
    'ta': 'Tamil',
    'te': 'Telugu',
    'es': 'Spanish',
    'fr': 'French'
}

SUPPORTED_LANGUAGE_MATRIX = {
    'en': ['hi', 'ta', 'te', 'es', 'fr'],
    'hi': ['en', 'ta', 'te', 'es', 'fr'],
    'ta': ['en', 'hi', 'es', 'fr'],
    'te': ['en', 'hi', 'es', 'fr'],
    'es': ['en', 'hi', 'ta', 'te', 'fr'],
    'fr': ['en', 'hi', 'ta', 'te', 'es']
}

# Thread-safe status and model holders
models = {
    'en-hi': None,
    'hi-en': None
}
model_status = {
    'status': 'idle',  # idle, loading, loaded, failed
    'error': None,
    'engine': 'Fallback (Google Translate)'
}

# Retry configuration for loading local transformer models
MODEL_RETRY_INTERVAL = 300  # seconds between retry attempts when load fails (5 minutes)
MODEL_MAX_RETRIES = 0  # 0 = unlimited
_model_load_attempts = 0
_model_retry_timer = None

# Lock for model access
model_lock = threading.Lock()

def load_transformer_models():
    global models, model_status
    global _model_load_attempts, _model_retry_timer
    _model_load_attempts += 1
    print("Background thread: Starting to load Transformer models... (attempt", _model_load_attempts, ")")
    with model_lock:
        model_status['status'] = 'loading'
        model_status['engine'] = 'Loading local models...'
    
    try:
        # Import transformers inside the thread to avoid blocking server start
        from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
        
        print(f"Loading English-Hindi model: {EN_HI_MODEL}...")
        en_hi_tokenizer = AutoTokenizer.from_pretrained(EN_HI_MODEL)
        en_hi_model = AutoModelForSeq2SeqLM.from_pretrained(EN_HI_MODEL)
        
        print(f"Loading Hindi-English model: {HI_EN_MODEL}...")
        hi_en_tokenizer = AutoTokenizer.from_pretrained(HI_EN_MODEL)
        hi_en_model = AutoModelForSeq2SeqLM.from_pretrained(HI_EN_MODEL)
        
        with model_lock:
            models['en-hi'] = {
                'tokenizer': en_hi_tokenizer,
                'model': en_hi_model
            }
            models['hi-en'] = {
                'tokenizer': hi_en_tokenizer,
                'model': hi_en_model
            }
            model_status['status'] = 'loaded'
            model_status['engine'] = 'Transformer (Local-Offline)'
            model_status['error'] = None
        print("Background thread: Transformer models loaded successfully!")
        # Cancel any pending retry timer
        if _model_retry_timer:
            try:
                _model_retry_timer.cancel()
            except Exception:
                pass
            _model_retry_timer = None
    except Exception as e:
        tb = traceback.format_exc()
        print(f"Background thread error loading models: {str(e)}\n{tb}")
        with model_lock:
            model_status['status'] = 'failed'
            model_status['error'] = str(e)
            model_status['engine'] = 'Fallback (Cloud-Online)'
        # Schedule a retry after configured interval unless we've exceeded max retries
        def _schedule_retry():
            global _model_retry_timer
            with model_lock:
                if model_status['status'] == 'loaded' or model_status['status'] == 'loading':
                    return
                print(f"Scheduling a retry to load models in {MODEL_RETRY_INTERVAL}s...")
                _model_retry_timer = threading.Timer(MODEL_RETRY_INTERVAL, load_transformer_models)
                _model_retry_timer.daemon = True
                _model_retry_timer.start()

        # If MODEL_MAX_RETRIES is 0 (unlimited) or attempts < max, schedule retry
        if MODEL_MAX_RETRIES == 0 or _model_load_attempts < MODEL_MAX_RETRIES:
            try:
                _schedule_retry()
            except Exception:
                pass

def translate_fallback(text, source, target):
    """Fallback translation using deep-translator (Google Translate API)"""
    if source == 'auto':
        source_lang = 'auto'
    else:
        source_lang = source

    try:
        translator = GoogleTranslator(source=source_lang, target=target)
        return translator.translate(text), "Cloud API (Online Fallback)"
    except Exception as e:
        logging.error("Fallback translation error: %s", e)
 
        return f"[Translation Error: {str(e)}]", "None"
 
@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/status', methods=['GET'])
def get_status():
    with model_lock:
        return jsonify({
            'status': model_status['status'],
            'engine': model_status['engine'],
            'error': model_status['error']
        })

@app.route('/api/languages', methods=['GET'])
def get_languages():
    language_list = [{'code': code, 'label': label} for code, label in LANGUAGE_LABELS.items()]
    return jsonify({
        'languages': language_list,
        'supported_pairs': SUPPORTED_LANGUAGE_MATRIX
    })


@app.route('/api/reload_models', methods=['POST'])
def reload_models():
    """Admin endpoint to manually trigger loading local transformer models."""
    global _model_load_attempts, _model_retry_timer
    with model_lock:
        if model_status['status'] == 'loading':
            return jsonify({'started': False, 'message': 'Models are already loading.'}), 409
        # reset attempts and cancel any scheduled retry
        _model_load_attempts = 0
        if _model_retry_timer:
            try:
                _model_retry_timer.cancel()
            except Exception:
                pass
            _model_retry_timer = None
        threading.Thread(target=load_transformer_models, daemon=True).start()

    return jsonify({'started': True, 'message': 'Model reload started.'})

@app.route('/api/translate', methods=['POST'])
def translate():
    data = request.get_json() or {}
    text = data.get('text', '').strip()
    source_lang = data.get('source_lang', 'en')
    target_lang = data.get('target_lang', 'hi')

    if not text:
        return jsonify({'translated_text': '', 'engine': 'None'})

    if source_lang == target_lang and source_lang != 'auto':
        return jsonify({
            'translated_text': text,
            'engine': 'No translation needed'
        })

    dir_key = f"{source_lang}-{target_lang}"
    use_local = False
    pipeline_model = None

    with model_lock:
        if source_lang != 'auto' and model_status['status'] == 'loaded' and dir_key in models:
            pipeline_model = models[dir_key]
            if pipeline_model is not None:
                use_local = True

    if use_local:
        try:
            start_time = time.time()
            tokenizer = pipeline_model['tokenizer']
            model = pipeline_model['model']
            inputs = tokenizer(text, return_tensors="pt", padding=True)
            outputs = model.generate(**inputs)
            translated = tokenizer.decode(outputs[0], skip_special_tokens=True)
            elapsed = time.time() - start_time
            engine = f"Local Transformer ({dir_key}) - {elapsed:.2f}s"
            return jsonify({
                'translated_text': translated,
                'engine': engine
            })
        except Exception as e:
            logging.error("Local model inference failed: %s", e)
            translated, engine = translate_fallback(text, source_lang, target_lang)
            return jsonify({
                'translated_text': translated,
                'engine': f"{engine} (Local error)"
            })

    translated, engine = translate_fallback(text, source_lang, target_lang)
    with model_lock:
        if model_status['status'] == 'idle':
            threading.Thread(target=load_transformer_models, daemon=True).start()
        current_status = model_status['status']
        if current_status == 'loading':
            engine = f"{engine} [Local models downloading in background]"
        elif current_status == 'failed':
            engine = f"{engine} [Local model unavailable]"

    return jsonify({
        'translated_text': translated,
        'engine': engine
    })

if __name__ == '__main__':
    # Ensure static directory exists
    os.makedirs(app.static_folder, exist_ok=True)
    # Start flask app
    app.run(host='127.0.0.1', port=5000, debug=True, use_reloader=False)
