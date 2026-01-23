// Image to Text Logic

let selectedImage = null;

// Drag & Drop Logic
const dropZone = document.getElementById('drop-zone');
const imageInput = document.getElementById('imageInput');

if (dropZone && imageInput) {
    dropZone.addEventListener('click', () => imageInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            imageInput.files = e.dataTransfer.files;
            previewImage();
        }
    });

    imageInput.addEventListener('change', previewImage);
}

function previewImage() {
    const input = document.getElementById('imageInput');
    const preview = document.getElementById('imagePreview');
    const loader = document.getElementById('loader');

    if (input.files && input.files[0]) {
        selectedImage = input.files[0];
        preview.src = URL.createObjectURL(selectedImage);
        preview.style.display = 'block'; // Ensure image is visible
        loader.innerText = "✅ Image loaded. Click 'Extract Text'.";
    } else {
        preview.src = '';
        selectedImage = null;
        loader.innerText = "❌ No image selected.";
    }
}

async function extractText() {
    if (!selectedImage) {
        document.getElementById('loader').innerText = "❗ Please upload an image first.";
        return;
    }

    const loader = document.getElementById('loader');
    const output = document.getElementById('outputText');
    const langResult = document.getElementById('langResult');

    loader.innerText = "🔍 Extracting... please wait...";
    output.innerText = '';
    langResult.innerText = '';

    try {
        const result = await Tesseract.recognize(
            selectedImage,
            'eng+hin+kan+tam+tel+mar+ben+guj+mal',  // OCR with all common Indian + English
            {
                langPath: 'https://tessdata.projectnaptha.com/4.0.0_best/', // hosted traineddata files
                logger: m => console.log(m)
            }
        );

        const extractedText = result.data.text.trim();
        const detectedLang = result.data.lang;

        output.innerText = extractedText;
        langResult.innerText = "🌐 Detected Language: " + (detectedLang ? detectedLang.toUpperCase() : "Unknown");
        loader.innerText = "✅ Text extracted successfully!";
    } catch (err) {
        console.error(err);
        loader.innerText = "❌ OCR failed. Try clearer image.";
    }
}

function copyText() {
    const output = document.getElementById("outputText");
    if (!output.innerText) {
        alert("Nothing to copy.");
        return;
    }
    const range = document.createRange();
    range.selectNodeContents(output);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("copy");
    alert("📋 Copied to clipboard!");
}

function clearText() {
    const output = document.getElementById("outputText");
    output.innerText = '';
    document.getElementById("langResult").innerText = '';
    document.getElementById("loader").innerText = "Upload a clear printed text image";
    document.getElementById("imageInput").value = '';
    const imgPreview = document.getElementById("imagePreview");
    imgPreview.src = '';
    imgPreview.style.display = 'none';
    selectedImage = null;
}

function saveAsPDF() {
    if (!window.jspdf) {
        alert("jsPDF library not loaded");
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const text = document.getElementById("outputText").innerText;
    if (!text) {
        alert("No text to save!");
        return;
    }
    const lines = doc.splitTextToSize(text, 180);
    doc.text(lines, 15, 20);
    doc.save("Extracted_Text.pdf");
}
