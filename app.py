import webview
import threading
import os
import io
import base64
from huggingface_hub import hf_hub_download, HfApi
from llama_cpp import Llama
from diffusers import StableDiffusionPipeline
import torch

# --- Model Definitions with Corrected, Publicly Accessible Repositories ---
SUPPORTED_TEXT_MODELS = {
    "phi-3": {"repo_id": "microsoft/Phi-3-mini-4k-instruct-gguf", "filename": "Phi-3-mini-4k-instruct-q4.gguf"},
    "mistral": {"repo_id": "TheBloke/Mistral-7B-Instruct-v0.2-GGUF", "filename": "mistral-7b-instruct-v0.2.Q4_K_M.gguf"},
    "kunoichi": {"repo_id": "Lewdiculous/Kunoichi-DPO-v2-7B-GGUF-Imatrix", "filename": "Kunoichi-DPO-v2-7B-Q4_K_M-imatrix.gguf"},
    "gemma": {"repo_id": "MaziyarPanahi/gemma-2b-it-GGUF", "filename": "gemma-2b-it.Q4_K_M.gguf"}
}

SUPPORTED_IMAGE_MODELS = {
    "sd1.5": {"repo_id": "runwayml/stable-diffusion-v1-5"},
    "qwen": {"repo_id": "segmind/tiny-sd"},
    "sd-turbo": {"repo_id": "stabilityai/sd-turbo"}
}

# --- Global Model Variables ---
text_model = None
image_pipeline = None
window = None


class Api:
    """This class is exposed to the JavaScript frontend via window.pywebview.api"""

    def download_all_models(self):
        """Starts the model download process in a separate thread."""
        downloader_thread = threading.Thread(target=self._download_worker)
        downloader_thread.start()

    def _download_worker(self):
        """Iterates through all models and downloads them with progress updates sent to the GUI."""
        api = HfApi()
        text_repos = set(config['repo_id'] for config in SUPPORTED_TEXT_MODELS.values())
        image_repos = set(config['repo_id'] for config in SUPPORTED_IMAGE_MODELS.values())
        all_repos = text_repos.union(image_repos)

        total_files = 0
        repo_file_lists = {}
        for repo_id in all_repos:
            try:
                files = [f.rfilename for f in api.list_repo_files_info(repo_id) if not f.rfilename.startswith('.')]
                repo_file_lists[repo_id] = files
                total_files += len(files)
            except Exception as e:
                print(f"Could not list files for {repo_id}: {e}")

        progress = 0
        for repo_id, filenames in repo_file_lists.items():
            for filename in filenames:
                message = f"Downloading {os.path.basename(repo_id)}: {filename}"
                try:
                    if window:
                        window.evaluate_js(f'updateDownloadProgress("{message}", {progress}, {total_files})')

                    hf_hub_download(
                        repo_id=repo_id,
                        filename=filename,
                        local_dir=f"models/{repo_id}",
                        local_dir_use_symlinks=False
                    )
                    progress += 1
                except Exception as e:
                    error_message = f"Skipping {filename} due to error."
                    print(f"{error_message} Details: {e}")

        if window:
            window.evaluate_js('downloadComplete()')

    def initialize_models(self, text_model_id, image_model_id):
        global text_model, image_pipeline
        try:
            text_config = SUPPORTED_TEXT_MODELS[text_model_id]
            print(f"Loading Text Model: {text_config['repo_id']}")
            text_model_path = os.path.join("models", text_config['repo_id'].replace("/", os.sep),
                                           text_config['filename'])
            text_model = Llama(model_path=text_model_path, n_ctx=4096, n_gpu_layers=0, verbose=False)

            image_config = SUPPORTED_IMAGE_MODELS[image_model_id]
            print(f"Loading Image Model: {image_config['repo_id']}")
            image_model_path = os.path.join("models", image_config['repo_id'].replace("/", os.sep))
            image_pipeline = StableDiffusionPipeline.from_pretrained(image_model_path, torch_dtype=torch.float32,
                                                                     local_files_only=True)

            print("Selected models loaded successfully.")
            return {"success": True}
        except Exception as e:
            error_str = f"Failed to load models. Ensure they were downloaded successfully. Error: {e}"
            print(f"CRITICAL: {error_str}")
            return {"error": error_str}

    def generate_text(self, prompt):
        if not text_model: return {"error": "Text model not initialized."}
        try:
            output = text_model(prompt, max_tokens=400, temperature=0.7,
                                stop=["Player:", "User:", "History:", "CONTEXT:", "TASK:"])
            return {"response": output['choices'][0]['text']}
        except Exception as e:
            return {"error": str(e)}

    def generate_image(self, prompt, image_type):
        if not image_pipeline: return {"error": "Image model not available."}
        try:
            full_prompt = "photorealistic, 8k, cinematic lighting, hyperdetailed, " + prompt
            height = 512 if image_type == 'portrait' else 384
            width = 512
            num_steps = 4 if "turbo" in image_pipeline.config["_name_or_path"] else 12
            image = image_pipeline(full_prompt, num_inference_steps=num_steps, height=height, width=width).images[0]
            buffered = io.BytesIO();
            image.save(buffered, format="JPEG")
            img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
            return {"image_data_url": f"data:image/jpeg;base64,{img_str}"}
        except Exception as e:
            return {"error": str(e)}


if __name__ == '__main__':
    api = Api()
    window = webview.create_window(
        'AI Storyteller',
        'frontend/index.html',
        js_api=api,
        width=1280,
        height=800
    )
    webview.start(debug=True)