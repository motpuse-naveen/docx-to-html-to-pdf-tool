from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import subprocess
import os
import uuid
import time

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_FOLDER = "uploads"
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), UPLOAD_FOLDER)

# Ensure 'uploads' directory exists inside backend
os.makedirs(UPLOADS_DIR, exist_ok=True)

# Mount static files for serving images
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    unique_folder = os.path.join(UPLOADS_DIR, "output_images", f"{int(time.time())}_{uuid.uuid4()}")
    os.makedirs(unique_folder, exist_ok=True)

    input_file_path = os.path.join(UPLOADS_DIR, file.filename)
    output_html_path = f"{input_file_path}.html"

    try:
        with open(input_file_path, "wb") as buffer:
            buffer.write(file.file.read())

        # Convert DOCX to HTML with extracted images
        subprocess.run(
            ["pandoc", "-f", "docx", "-t", "html", "--extract-media", unique_folder, "-o", output_html_path, input_file_path],
            check=True
        )

        with open(output_html_path, "r", encoding="utf-8") as f:
            html_content = f.read()

        # Fix image paths to match FastAPI static serving
        updated_html = html_content.replace('src="media/', f'src="/uploads/output_images/{os.path.basename(unique_folder)}/')

        return {"html": updated_html, "folder": unique_folder}

    except Exception as e:
        return {"error": str(e)}

    finally:
        # Cleanup temporary files
        if os.path.exists(input_file_path):
            os.remove(input_file_path)
        if os.path.exists(output_html_path):
            os.remove(output_html_path)
