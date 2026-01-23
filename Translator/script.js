// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.9.179/pdf.worker.min.js';

const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const extractBtn = document.getElementById('extract-btn');
const translateBtn = document.getElementById('translateBtn');
const startPageInput = document.getElementById('start-page');
const endPageInput = document.getElementById('end-page');
const inputTextArea = document.getElementById('inputText');
const outputTextArea = document.getElementById('outputText');

let pdfDoc = null;

// Drag and Drop Logic
if (dropZone) {
  dropZone.addEventListener('click', () => fileInput.click());

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
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files;
      const event = new Event('change');
      fileInput.dispatchEvent(event);
    }
  });
}

// File Input Change Listener - Loads PDF
fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file || file.type !== 'application/pdf') {
    alert("Please select a valid PDF file.");
    return;
  }

  inputTextArea.innerText = "Loading PDF...";
  extractBtn.disabled = true;
  translateBtn.disabled = true;

  try {
    const arrayBuffer = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Reset page inputs
    startPageInput.value = 1;
    endPageInput.value = pdfDoc.numPages;
    startPageInput.max = pdfDoc.numPages;
    endPageInput.max = pdfDoc.numPages;

    inputTextArea.innerText = `✅ PDF Loaded (${pdfDoc.numPages} pages).\nSelect pages above and click 'Extract Text' to begin.`;
    extractBtn.disabled = false;

  } catch (error) {
    console.error('Error loading PDF:', error);
    inputTextArea.innerText = "❌ Error loading PDF. Please try another file.";
  }
});

// Extract Text Button Listener
extractBtn.addEventListener('click', async () => {
  if (!pdfDoc) return;

  let startPage = parseInt(startPageInput.value, 10);
  let endPage = parseInt(endPageInput.value, 10);

  if (isNaN(startPage) || startPage < 1) startPage = 1;
  if (isNaN(endPage) || endPage > pdfDoc.numPages) endPage = pdfDoc.numPages;

  if (startPage > endPage) {
    alert("Start page cannot be greater than end page.");
    return;
  }

  extractBtn.disabled = true;
  inputTextArea.innerText = "Extracting text... please wait.";
  translateBtn.disabled = true;

  try {
    let fullText = '';
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      // Clean up text
      fullText += pageText.replace(/\s+/g, ' ') + '\n\n';
    }

    fullText = fullText.trim();
    if (!fullText) {
      inputTextArea.innerText = "⚠️ No text found in the selected pages.";
      extractBtn.disabled = false;
      return;
    }

    inputTextArea.innerText = fullText;
    translateBtn.disabled = false;
    extractBtn.disabled = false;

  } catch (error) {
    console.error('Error extracting text:', error);
    inputTextArea.innerText = "❌ Failed to extract text.";
    extractBtn.disabled = false;
  }
});

// Translate Button Listener
translateBtn.addEventListener('click', async () => {
  const text = inputTextArea.innerText.trim();
  if (!text || text.startsWith("Loading") || text.startsWith("Error")) {
    alert("Please extract text first.");
    return;
  }

  const fromLang = document.getElementById('fromLang').value;
  const toLang = document.getElementById('toLang').value;
  const output = document.getElementById('outputText');

  translateBtn.disabled = true;
  translateBtn.innerText = "Translating...";
  output.innerText = "Translating...";

  try {
    // Using the khalyomede/translate library included in HTML
    const result = await translate(text, {
      from: fromLang === "auto" ? undefined : fromLang,
      to: toLang
    });
    output.innerText = result;
  } catch (error) {
    console.error(error);
    output.innerText = "❌ Translation failed. Please check your internet connection or try a shorter text.";
  } finally {
    translateBtn.disabled = false;
    translateBtn.innerText = "Translate";
  }
});

// Utility Functions
function copyText() {
  const output = document.getElementById('outputText');
  if (!output.innerText || output.innerText === "Translating..." || output.innerText.startsWith("❌")) {
    alert("Nothing to copy.");
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(output);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("copy");
  alert("Translated text copied!");
}

function clearText() {
  document.getElementById('inputText').innerText = "";
  document.getElementById('outputText').innerText = "";
  document.getElementById('file-input').value = "";
  if (extractBtn) extractBtn.disabled = true;
  if (translateBtn) translateBtn.disabled = true;
  pdfDoc = null;
  startPageInput.value = 1;
  endPageInput.value = 1;
  // Reset message
  inputTextArea.innerText = "";
}
