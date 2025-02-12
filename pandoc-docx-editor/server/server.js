const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid"); // Unique ID generator

const bodyParser = require("body-parser");
const puppeteer = require("puppeteer");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // Serve static files
app.use("/uploads/output_images", express.static(path.join(__dirname, "uploads/output_images")));
app.use(bodyParser.json({ limit: "50mb" }));
// Serve PDFs as static files
app.use("/uploads/pdfs", express.static(path.join(__dirname, "uploads/pdfs")));


/**
 * Convert .wmf and .emf images to .png recursively before sending HTML response.
 */
async function convertVectorImagesToPng(mediaFolder, outputHtmlFilePath) {
    console.log(`🔍 Scanning for WMF/EMF images in: ${mediaFolder}`);

    if (!fs.existsSync(mediaFolder)) {
        console.error(`❌ Error: Folder "${mediaFolder}" does not exist.`);
        return;
    }

    let conversionPromises = [];

    async function scanDirectory(directory) {
        const files = fs.readdirSync(directory, { withFileTypes: true });

        for (const file of files) {
            const filePath = path.join(directory, file.name);

            if (file.isDirectory()) {
                await scanDirectory(filePath);
            } else if (file.name.endsWith(".wmf") || file.name.endsWith(".emf")) {
                const outputPath = filePath.replace(/\.(wmf|emf)$/, ".png");

                console.log(`🟢 Found vector image: ${filePath}, converting to ${outputPath}`);

                const conversionPromise = new Promise((resolve, reject) => {
                    exec(`inkscape "${filePath}" --export-filename="${outputPath}" --export-type=png`, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`❌ Error converting ${file.name}:`, stderr);
                            reject(error);
                        } else {
                            console.log(`✅ Converted ${file.name} to ${outputPath}`);
                            console.log(`📜 Inkscape output: ${stdout}`);

                            // Replace image references in HTML
                            replaceImageReferences(outputHtmlFilePath, file.name, path.basename(outputPath));

                            // Optionally delete the original file
                            fs.unlink(filePath, () => console.log(`🗑️ Deleted ${file.name}`));
                            resolve();
                        }
                    });
                });

                conversionPromises.push(conversionPromise);
            }
        }
    }

    await scanDirectory(mediaFolder);
    await Promise.all(conversionPromises);
    console.log("✅ All WMF/EMF images converted successfully!");
}

/**
 * Replace .wmf and .emf references in the generated HTML file.
 */
function replaceImageReferences(htmlFilePath, oldName, newName) {
    if (!fs.existsSync(htmlFilePath)) {
        console.log("⚠️ No HTML file found to update image references.");
        return;
    }

    fs.readFile(htmlFilePath, "utf8", (err, content) => {
        if (err) {
            console.error("❌ Error reading HTML file:", err);
            return;
        }

        const updatedContent = content.replace(new RegExp(`src="([^"]*?)${oldName}"`, "g"), `src="$1${newName}"`);

        fs.writeFile(htmlFilePath, updatedContent, "utf8", (err) => {
            if (err) {
                console.error("❌ Error updating image references:", err);
            } else {
                console.log(`🔄 Updated image reference: ${oldName} → ${newName}`);
            }
        });
    });
}

module.exports = { convertVectorImagesToPng };


/**
 * Handle DOCX upload and conversion.
 */
 app.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    const uniqueFolder = `uploads/output_images/${Date.now()}_${uuidv4()}`;
    const inputFilePath = req.file.path;
    const outputFilePath = `${inputFilePath}.html`;

    try {
        // Ensure the unique image folder exists
        fs.mkdirSync(uniqueFolder, { recursive: true });

        // Run Pandoc with a unique media folder
        await new Promise((resolve, reject) => {
            exec(
                `pandoc -f docx -t html --extract-media="${uniqueFolder}" -o "${outputFilePath}" "${inputFilePath}"`,
                (error) => {
                    if (error) {
                        console.error("Error running Pandoc:", error);
                        reject(error);
                    } else {
                        resolve();
                    }
                }
            );
        });

        // ✅ Convert WMF/EMF images to PNG before sending HTML
        await convertVectorImagesToPng(uniqueFolder, outputFilePath);

        console.log("✅ Conversion completed. Processing HTML...");
        console.log("outputFilePath:", outputFilePath);

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
    } catch (error) {
        res.status(500).json({ error: "Conversion failed", details: error.message });
    }
});

app.post("/generate-pdf", async (req, res) => {
    const { htmlContent } = req.body;

    if (!htmlContent) {
        console.log("❌ No HTML content received");
        return res.status(400).json({ error: "HTML content is required" });
    }

    console.log("🔍 Received HTML content for PDF generation");

    try {
        const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: "domcontentloaded" });

        console.log("✅ Puppeteer loaded the content");

        // Ensure the directory exists
        const pdfDir = path.join(__dirname, "uploads/pdfs");
        if (!fs.existsSync(pdfDir)) {
            fs.mkdirSync(pdfDir, { recursive: true });
        }

        // Generate a unique filename
        const pdfFilename = `generated_${Date.now()}.pdf`;
        const pdfFilePath = path.join(pdfDir, pdfFilename);

        // Save PDF
        await page.pdf({ path: pdfFilePath, format: "A4", printBackground: true, margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" }, scale: 1});

        await browser.close();
        console.log(`📄 PDF saved successfully: ${pdfFilePath}`);

        // Return a download link
        const baseUrl = "http://localhost:5000"; // Change this to your server URL
        const downloadLink = `${baseUrl}/uploads/pdfs/${pdfFilename}`;

        res.json({ success: true, downloadLink });
    } catch (error) {
        console.error("❌ PDF generation failed:", error);
        res.status(500).json({ error: "Failed to generate PDF" });
    }
});

app.get("/test-pdf", async (req, res) => {
    try {
        const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
        const page = await browser.newPage();
        await page.setContent("<h1>Test PDF</h1>", { waitUntil: "domcontentloaded" });

        const pdfBuffer = await page.pdf({ format: "A4", printBackground: true, margin: { top: "40px", right: "40px", bottom: "40px", left: "40px" }, scale: 1 });

        await browser.close();
        console.log("✅ Test PDF generated successfully");

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": "attachment; filename=test.pdf",
            "Content-Length": pdfBuffer.length,
        });

        res.send(pdfBuffer);
    } catch (error) {
        console.error("❌ Test PDF generation failed:", error);
        res.status(500).json({ error: "Failed to generate test PDF" });
    }
});


// ✅ Start the Express Server
app.listen(5000, () => {
    console.log("Server running on http://localhost:5000");
});
