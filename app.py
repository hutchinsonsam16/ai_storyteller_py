import webview
import threading
import os
import io
import base64
from flask import Flask, request, jsonify, send_from_directory
from ctransformers import AutoModelForCausalLM
from diffusers import StableDiffusionPipeline
import torch

# --- Flask App Initialization ---
app = Flask(__name__, static_folder='frontend', static_url_path='')

# --- AI Model Loading (in a separate thread to not block the GUI) ---
text_model = None
image_pipeline = None

def load_models():
    global text_model, image_pipeline
    print("Initializing AI models...")
    
    try:
        print("Loading Text Model: TheBloke/Phi-3-mini-4k-instruct-GGUF...")
        text_model = AutoModelForCausalLM.from_pretrained(
            "TheBloke/Phi-3-mini-4k-instruct-GGUF",
            model_file="Phi-3-mini-4k-instruct.Q4_K_M.gguf",
            model_type="phi3", # Corrected model type
            context_length=4096,
            gpu_layers=0
        )
        print("Text model loaded successfully.")
    except Exception as e:
        print(f"CRITICAL: Failed to load text model. Error: {e}")

    try:
        print("Loading Image Model: runwayml/stable-diffusion-v1-5...")
        image_pipeline = StableDiffusionPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            torch_dtype=torch.float32,
            cache_dir="./models"
        )
        print("Image model loaded successfully.")
    except Exception as e:
        print(f"CRITICAL: Failed to load image model. Error: {e}")
        
    print("AI models are ready.")

# --- API Endpoints for the Frontend ---
@app.route('/')
def index():
    return send_from_directory('frontend', 'index.html')

@app.route('/generate/text', methods=['POST'])
def generate_text():
    if not text_model:
        return jsonify({"error": "Text model is not available."}), 503

    data = request.get_json()
    prompt = data.get('prompt')
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    try:
        response = text_model(prompt, stream=False, max_new_tokens=400, temperature=0.7, top_k=50)
        return jsonify({"response": response})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/generate/image', methods=['POST'])
def generate_image():
    if not image_pipeline:
        return jsonify({"error": "Image model is not available."}), 503

    data = request.get_json()
    prompt = data.get('prompt')
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400
        
    try:
        image = image_pipeline(prompt, num_inference_steps=12, height=512, width=512).images[0]
        
        buffered = io.BytesIO()
        image.save(buffered, format="JPEG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        data_url = f"data:image/jpeg;base64,{img_str}"
        
        return jsonify({"image_data_url": data_url})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Main Application Logic ---
if __name__ == '__main__':
    # Start loading models in the background
    model_thread = threading.Thread(target=load_models)
    model_thread.start()

    # Create the PyWebView window that loads the Flask app
    webview.create_window(
        'AI Storyteller',
        app,
        width=1280,
        height=800
    )
    webview.start(debug=True) # Set debug=False for production