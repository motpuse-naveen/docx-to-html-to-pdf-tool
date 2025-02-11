import React, { useState, useRef } from "react";
import axios from "axios";
import { Editor } from "@tinymce/tinymce-react";

const UploadDocx = () => {
    const [htmlContent, setHtmlContent] = useState("");
    const [error, setError] = useState("");
    const fileInputRef = useRef(null);

    const handleFileChange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setError(""); // Clear previous errors
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await axios.post("http://localhost:5000/upload", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });

            setHtmlContent(response.data.html);
        } catch (error) {
            console.error("Error uploading file:", error);
            setError("Failed to upload file. Please try again.");
        }
    };

    return (
        <div style={{ padding: "20px", maxWidth: "816px", margin: "auto" }}>
            <h2>Upload DOCX and Convert to HTML</h2>
            <label style={{ marginBottom: "10px" }}>
                <strong>Select DOCX File:</strong>
            </label>
            <input type="file" accept=".docx" ref={fileInputRef} onChange={handleFileChange} />

            {error && <p style={{ color: "red" }}>{error}</p>}

            {htmlContent && (
                <>
                    <button 
                        style={{ margin: "10px 0", padding: "5px 10px", cursor: "pointer" }}
                        onClick={() => setHtmlContent("")}
                    >
                        Clear
                    </button>

                    <Editor
                        apiKey="1lizk0khiw3hddok9wnmvlvfj0fik0vld59y3sn4sa4woygk"
                        initialValue={htmlContent}
                        init={{
                            height: 500,
                            menubar: true,
                            plugins: "lists link image code",
                            toolbar: "undo redo | formatselect | bold italic | alignleft aligncenter alignright | code",
                        }}
                    />
                </>
            )}
        </div>
    );
};

export default UploadDocx;
