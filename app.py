import os
import threading
import time
import mimetypes
from flask import Flask, request, jsonify, send_from_directory
from deep_translator import GoogleTranslator

# Force correct MIME types for Windows registry compatibility (solves CSS MIME-type blocker)
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/javascript', '.js')

app = Flask(__name__, static_folder='static', static_url_path='')

# Model configuration
EN_HI_MODEL = "Helsinki-NLP/opus-mt-en-hi"
HI_EN_MODEL = "Helsinki-NLP/opus-mt-hi-en"

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

# Lock for model access
model_lock = threading.Lock()

def load_transformer_models():
    global models, model_status
    print("Background thread: Starting to load Transformer models...")
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
    except Exception as e:
        print(f"Background thread error loading models: {str(e)}")
        with model_lock:
            model_status['status'] = 'failed'
            model_status['error'] = str(e)
            model_status['engine'] = 'Fallback (Cloud-Online)'

def translate_fallback(text, source, target):
    """Fallback translation using deep-translator (Google Translate API)"""
    try:
        translator = GoogleTranslator(source=source, target=target)
        return translator.translate(text), "Cloud API (Online Fallback)"
    except Exception as e:
        print(f"Fallback translation error: {e}")
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

@app.route('/api/translate', methods=['POST'])
def translate():
    data = request.get_json() or {}
    text = data.get('text', '').strip()
    source_lang = data.get('source_lang', 'en') # 'en', 'hi', etc.
    target_lang = data.get('target_lang', 'hi') # 'hi', 'en', etc.

    if not text:
        return jsonify({'translated_text': '', 'engine': 'None'})

    # Determine direction key
    dir_key = f"{source_lang}-{target_lang}"
    
    # Check if local model can handle this direction and is loaded
    use_local = False
    pipeline_model = None
    
    with model_lock:
        if model_status['status'] == 'loaded' and dir_key in models:
            pipeline_model = models[dir_key]
            if pipeline_model is not None:
                use_local = True

    if use_local:
        try:
            start_time = time.time()
            # Run local transformer inference
            tokenizer = pipeline_model['tokenizer']
            model = pipeline_model['model']
            
            inputs = tokenizer(text, return_tensors="pt", padding=True)
            outputs = model.generate(**inputs)
            translated = tokenizer.decode(outputs[0], skip_special_tokens=True)
            
            elapsed = time.time() - start_time
            engine = f"Transformer Local (Inference: {elapsed:.2f}s)"
            return jsonify({
                'translated_text': translated,
                'engine': engine
            })
        except Exception as e:
            print(f"Local model inference failed, falling back: {e}")
            # Fall back to cloud API if inference fails
            translated, engine = translate_fallback(text, source_lang, target_lang)
            return jsonify({
                'translated_text': translated,
                'engine': f"{engine} (Local error)"
            })
    else:
        # Fall back to cloud translation
        translated, engine = translate_fallback(text, source_lang, target_lang)
        # If models have not started loading, kick off loading thread
        with model_lock:
            if model_status['status'] == 'idle':
                # Start background loading thread
                threading.Thread(target=load_transformer_models, daemon=True).start()
        
        # Add visual context about backend state
        with model_lock:
            current_status = model_status['status']
            if current_status == 'loading':
                engine = f"{engine} [Local models downloading/initializing in background...]"
            elif current_status == 'failed':
                engine = f"{engine} [Local model run disabled due to resource constraints]"
        
        return jsonify({
            'translated_text': translated,
            'engine': engine
        })

if __name__ == '__main__':
    # Ensure static directory exists
    os.makedirs(app.static_folder, exist_ok=True)
    # Start flask app
    app.run(host='127.0.0.1', port=5000, debug=True, use_reloader=False)
