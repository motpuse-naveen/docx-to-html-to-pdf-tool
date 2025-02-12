import React, { useState, useRef } from "react";
import axios from "axios";
import { Editor } from "@tinymce/tinymce-react";

const UploadDocx = () => {
    const [htmlContent, setHtmlContent] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const editorRef = useRef(null);
    const fileInputRef = useRef(null);

    const [downloadLink, setDownloadLink] = useState("");

    const handleFileChange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setError(""); 
        setLoading(true);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await axios.post("http://localhost:5000/upload", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            const fixedHtml = response.data.html.replace(
                /src="uploads\/output_images\//g,
                'src="http://localhost:5000/uploads/output_images/'
            );

            setHtmlContent(fixedHtml);
        } catch (error) {
            console.error("Error uploading file:", error);
            setError("Failed to upload file. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // Export to PDF using Puppeteer
    const exportToPDF = async () => {
        if (!editorRef.current) return;

        const content = editorRef.current.getContent();
        console.log("🔍 HTML content being sent to backend:", content); // Debugging

        try {
            const response = await axios.post(
                "http://localhost:5000/generate-pdf",
                { htmlContent: content }
            );
    
            if (response.data.success) {
                setDownloadLink(response.data.downloadLink);
            } else {
                alert("Failed to generate PDF.");
            }
        } catch (error) {
            console.error("🚨 Error exporting to PDF:", error);
            alert("Failed to export PDF.");
        }
    };

    

    return (
        <div style={{ padding: "10px", maxWidth: "816px", margin: "auto" }}>
            <h2>Upload DOCX and Convert to HTML</h2>

            <label style={{ marginBottom: "10px" }}>
                <strong>Select DOCX File:</strong>
            </label>
            <input type="file" accept=".docx" ref={fileInputRef} onChange={handleFileChange} />

            {loading && <p style={{ color: "blue" }}>Processing file... Please wait.</p>}

            {error && <p style={{ color: "red" }}>{error}</p>}

            {htmlContent && !loading && (
                <>
                    <button 
                        style={{ margin: "10px 5px", padding: "5px 10px", cursor: "pointer" }}
                        onClick={() => setHtmlContent("")}
                    >
                        Clear
                    </button>

                    <button 
                        style={{ margin: "10px 5px", padding: "5px 10px", cursor: "pointer" }}
                        onClick={exportToPDF}
                    >
                        Export to PDF
                    </button>
                    {downloadLink && (
                        <p className="downloadlinkpane">
                            ✅ PDF Generated! <a href={downloadLink} target="_blank" rel="noopener noreferrer">Download PDF</a>
                        </p>
                    )}

                    <Editor
                        apiKey="1lizk0khiw3hddok9wnmvlvfj0fik0vld59y3sn4sa4woygk"
                        onInit={(evt, editor) => (editorRef.current = editor)}
                        initialValue={htmlContent}
                        init={{
                            height: 500,
                            menubar: true,
                            plugins: "lists link image code",
                            toolbar: "undo redo | formatselect | bold italic | alignleft aligncenter alignright | code",
                            images_upload_url: "http://localhost:5000/upload-image",
                            automatic_uploads: true,
                        }}
                    />
                    
                </>
            )}
        </div>
    );
};

export default UploadDocx;
