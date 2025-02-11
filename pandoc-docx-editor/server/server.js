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

        fs.readFile(outputFilePath, "utf8", (err, htmlContent) => {
            if (err) {
                return res.status(500).json({ error: "Error reading HTML file" });
            }

            // ✅ Update Image Paths in HTML
            const baseUrl = "http://localhost:5000"; // Ensure this matches your frontend
            const updatedHtml = htmlContent.replace(/src="output_images\//g, `src="${baseUrl}/${uniqueFolder}/`);

            // ✅ Send response first before cleanup
            res.json({ html: updatedHtml, folder: uniqueFolder });

            // ✅ Cleanup after response
            setTimeout(() => {
                fs.unlink(inputFilePath, () => {});
                fs.unlink(outputFilePath, () => {});
            }, 3000); // Wait 3s before deleting
        });
    });
});

app.listen(5000, () => {
    console.log("Server running on http://localhost:5000");
});
