from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import subprocess
import os
import uuid
import time
from pathlib import Path

import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)



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

logger.info(f" Received file:")
logger.debug(f" Received file:")

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    logger.debug(f" Received file: {file.filename}")

    unique_folder = os.path.join(UPLOADS_DIR, "output_images", f"{int(time.time())}_{uuid.uuid4()}")
    os.makedirs(unique_folder, exist_ok=True)

    input_file_path = os.path.join(UPLOADS_DIR, file.filename)
    output_html_path = f"{input_file_path}.html"

    try:
        with open(input_file_path, "wb") as buffer:
            buffer.write(file.file.read())

        print(f"📂 Saving file to: {input_file_path}")

        # Convert DOCX to HTML with extracted images
        subprocess.run(
            ["pandoc", "-f", "docx", "-t", "html", "--extract-media", unique_folder, "-o", output_html_path, input_file_path],
            check=True
        )

        print(f"📂 Extracted images saved in: {unique_folder}")

        # Convert .wmf and .emf images to .png
        convert_vector_images_to_png(unique_folder)

        with open(output_html_path, "r", encoding="utf-8") as f:
            html_content = f.read()

        NODE_SERVER_URL = "http://localhost:5000"
        updated_html = html_content.replace('src="media/', f'src="{NODE_SERVER_URL}/uploads/output_images/{os.path.basename(unique_folder)}/')

        print(f"✅ Conversion complete. Sending HTML response.")

        return {"html": updated_html, "folder": unique_folder}

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return {"error": str(e)}

    finally:
        # Cleanup temporary files
        if os.path.exists(input_file_path):
            os.remove(input_file_path)
        if os.path.exists(output_html_path):
            os.remove(output_html_path)


def convert_vector_images_to_png(media_folder):
    """Convert all .wmf and .emf images in media_folder to .png using Inkscape."""
    print(f"🔍 Scanning for WMF/EMF images in: {media_folder}")  # Debug log

    for vector_file in Path(media_folder).rglob("*.[we]mf"):  # Matches .wmf and .emf files
        png_file = vector_file.with_suffix(".png")

        print(f"🟢 Found: {vector_file}, converting to {png_file}")

        try:
            result = subprocess.run(
                [
                    "inkscape",
                    str(vector_file),
                    "--export-filename=" + str(png_file),
                    "--export-type=png",
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            print(f"✅ Converted {vector_file} to {png_file}")
            print(f"📜 Inkscape output: {result.stdout}")

            # Replace references in HTML
            replace_image_references(media_folder, vector_file.name, png_file.name)

            # Optionally remove the original .wmf/.emf file after conversion
            os.remove(vector_file)

        except subprocess.CalledProcessError as e:
            print(f"❌ Error converting {vector_file}: {e.stderr}")
            print(f"🔴 Full Error Message: {e}")


def replace_image_references(media_folder, old_name, new_name):
    """Replace .wmf and .emf references in the generated HTML file."""
    html_file = next(Path(media_folder).parent.glob("*.html"), None)
    if html_file:
        with open(html_file, "r", encoding="utf-8") as f:
            content = f.read()
        updated_content = content.replace(f'src="media/{old_name}"', f'src="media/{new_name}"')
        with open(html_file, "w", encoding="utf-8") as f:
            f.write(updated_content)