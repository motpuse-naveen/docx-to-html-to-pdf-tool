const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid"); // Unique ID generator

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // Serve static files

/**
 * Convert all .wmf and .emf images in media_folder to .png using Inkscape.
 */
 function convertVectorImagesToPng(mediaFolder) {
    console.log(`🔍 Scanning for WMF/EMF images in: ${mediaFolder}`);

    // Check if mediaFolder exists
    if (!fs.existsSync(mediaFolder)) {
        console.error(`❌ Error: Folder "${mediaFolder}" does not exist.`);
        return;
    }

    // 🔄 Recursive function to scan subdirectories
    function scanDirectory(directory) {
        fs.readdir(directory, { withFileTypes: true }, (err, files) => {
            if (err) {
                console.error("❌ Error reading media folder:", err);
                return;
            }

            let foundImages = false;

            files.forEach((file) => {
                const filePath = path.join(directory, file.name);

                if (file.isDirectory()) {
                    // 📂 If it's a folder, scan recursively
                    scanDirectory(filePath);
                } else if (file.name.endsWith(".wmf") || file.name.endsWith(".emf")) {
                    foundImages = true;

                    const outputPath = filePath.replace(/\.(wmf|emf)$/, ".png");

                    console.log(`🟢 Found vector image: ${filePath}, converting to ${outputPath}`);

                    exec(`inkscape "${filePath}" --export-filename="${outputPath}" --export-type=png`, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`❌ Error converting ${file.name}:`, stderr);
                        } else {
                            console.log(`✅ Converted ${file.name} to ${outputPath}`);
                            console.log(`📜 Inkscape output: ${stdout}`);

                            // Replace image references in HTML
                            replaceImageReferences(mediaFolder, file.name, path.basename(outputPath));

                            // Optionally delete the original .wmf/.emf file
                            fs.unlink(filePath, () => console.log(`🗑️ Deleted ${file.name}`));
                        }
                    });
                }
            });

            if (!foundImages) {
                console.log(`⚠️ No .wmf or .emf images found in ${directory}`);
            }
        });
    }

    // Start scanning from mediaFolder
    scanDirectory(mediaFolder);
}

/**
 * Replace .wmf and .emf references in the generated HTML file.
 */
function replaceImageReferences(mediaFolder, oldName, newName) {
    const htmlFilePath = fs.readdirSync(path.dirname(mediaFolder)).find(file => file.endsWith(".html"));
    
    if (!htmlFilePath) {
        console.log("⚠️ No HTML file found to update image references.");
        return;
    }

    const fullHtmlPath = path.join(path.dirname(mediaFolder), htmlFilePath);
    fs.readFile(fullHtmlPath, "utf8", (err, content) => {
        if (err) {
            console.error("❌ Error reading HTML file:", err);
            return;
        }

        const updatedContent = content.replace(new RegExp(`src="media/${oldName}"`, "g"), `src="media/${newName}"`);

        fs.writeFile(fullHtmlPath, updatedContent, "utf8", (err) => {
            if (err) {
                console.error("❌ Error updating image references:", err);
            } else {
                console.log(`🔄 Updated image reference: ${oldName} → ${newName}`);
            }
        });
    });
}

/**
 * Handle DOCX upload and conversion.
 */
app.post("/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    const uniqueFolder = `uploads/output_images/${Date.now()}_${uuidv4()}`;
    const inputFilePath = req.file.path;
    const outputFilePath = `${inputFilePath}.html`;

    // Ensure the unique image folder exists
    fs.mkdirSync(uniqueFolder, { recursive: true });

    // Run Pandoc with a unique media folder
    exec(`pandoc -f docx -t html --extract-media="${uniqueFolder}" -o "${outputFilePath}" "${inputFilePath}"`, (error) => {
        if (error) {
            console.error("Error running Pandoc:", error);
            return res.status(500).json({ error: "Error converting file" });
        }

        // ✅ Convert WMF/EMF to PNG
        convertVectorImagesToPng(uniqueFolder);

        console.log("outputFilePath:", outputFilePath);
setTimeout(() => {
        fs.readFile(outputFilePath, "utf8", (err, htmlContent) => {
            if (err) {
                return res.status(500).json({ error: "Error reading HTML file" });
            }

            // ✅ Update Image Paths in HTML
            const baseUrl = "http://localhost:5000"; // Ensure this matches your frontend
            const updatedHtml = htmlContent.replace(/src="output_images\//g, `src="${baseUrl}/${uniqueFolder}/`);
            const finalHtml = updatedHtml.replace(/src="([^"]+)\.(wmf|emf)"/g, 'src="$1.png"');

            // ✅ Send response first before cleanup
            res.json({ html: finalHtml, folder: uniqueFolder });

            // ✅ Cleanup after response
            setTimeout(() => {
                fs.unlink(inputFilePath, () => {});
                fs.unlink(outputFilePath, () => {});
            }, 3000); // Wait 3s before deleting
        });
    }, 6000); 
    });
});

// ✅ Start the Express Server
app.listen(5000, () => {
    console.log("🚀 Server running on http://localhost:5000");
});
