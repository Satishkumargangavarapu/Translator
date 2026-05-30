# Translator

A multilingual translator web application built with Flask for the backend and a glassmorphic UI frontend. It supports English and Hindi translation locally via Hugging Face transformer models, and uses a Google Translate fallback for additional languages.

## Overview

This project is a lightweight translator app designed to provide both local offline translation and cloud-based fallback translation. It serves a static frontend and exposes two main API endpoints for translation and status checks.

## Features

- Local offline translation for English ↔ Hindi using `transformers` models.
- Cloud-based fallback translation using `deep-translator` and Google Translate.
- Background model loading so the app starts quickly without waiting for large model downloads.
- A responsive static web UI with input, output, history, and audio features.
- Support for English, Hindi, Tamil, and Telugu in the frontend.

## File Structure

- `app.py`
  - Flask application that serves the frontend and translation API.
  - Loads local transformer models in a background thread.
  - Provides `/api/translate` and `/api/status` endpoints.
  - Uses `GoogleTranslator` for fallback translation.

- `gluon_translator.py`
  - Educational script illustrating how a sequence-to-sequence translation model can be implemented in Python.
  - Shows tokenization and translation steps for machine translation workflows.

- `requirements.txt`
  - Lists Python dependencies required to run the application.
  - Includes Flask, transformers, torch, sentencepiece, deep-translator, and other helper packages.

- `verify_all.py`
  - Verification script to confirm translation behavior across available languages.
  - Useful for testing and validating the translation flow.

- `walkthrough.md`
  - Describes project architecture, features, and implementation details.
  - Includes a human-readable summary of the translator app.

- `static/`
  - `index.html` - Frontend markup and UI elements.
  - `app.js` - Client-side logic for translation, UI interactions, voice input, and speech output.
  - `style.css` - Styling for the glassmorphic interface and responsive layout.

## How It Works

1. The Flask app serves the static frontend from the `static` folder.
2. When the user submits text, the frontend sends a POST request to `/api/translate`.
3. The backend checks whether the local transformer models are loaded:
   - If loaded, it performs local translation.
   - If not, it falls back to the Google Translate API.
4. The backend returns translated text plus the engine used for translation.
5. The frontend displays the translated output and engine status.

## Running Locally

1. Create and activate a Python virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Start the application:

```bash
python app.py
```

4. Open your browser at `http://127.0.0.1:5000`.

## Notes

- The local models are downloaded from Hugging Face when first used.
- If local model loading fails, the app automatically uses the cloud fallback.
- The app is configured to serve static files correctly on Windows by fixing MIME types for CSS and JavaScript.

## GitHub Repository

This repository is linked to `https://github.com/Satishkumargangavarapu/Translator.git`.
