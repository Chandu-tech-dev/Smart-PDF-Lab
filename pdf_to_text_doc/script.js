const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.9.179/pdf.worker.min.js';

const pdfUpload = document.getElementById('pdf-upload');
const pagesContainer = document.getElementById('pages-container');
const generateBtn = document.getElementById('generate-btn');
const downloadLink = document.getElementById('download-link');

let pdfDoc = null;
let selectedPages = new Set();

pdfUpload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || file.type !== 'application/pdf') {
    alert('Please upload a valid PDF file.');
    return;
  }

  const arrayBuffer = await file.arrayBuffer();
  pdfDoc = await pdfjsLib.getDocument({data: arrayBuffer}).promise;

  pagesContainer.innerHTML = '';
  selectedPages.clear();

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });

    // Create canvas and render page
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    await page.render(renderContext).promise;

    // Create page wrapper
    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'page-wrapper';
    pageWrapper.dataset.pageNumber = i;

    // Add canvas
    pageWrapper.appendChild(canvas);

    // Add page number label
    const pageNumberLabel = document.createElement('div');
    pageNumberLabel.className = 'page-number';
    pageNumberLabel.textContent = 'Page ' + i;
    pageWrapper.appendChild(pageNumberLabel);

    // Toggle selection on click
    pageWrapper.addEventListener('click', () => {
      if (selectedPages.has(i)) {
        selectedPages.delete(i);
        pageWrapper.classList.remove('selected');
      } else {
        selectedPages.add(i);
        pageWrapper.classList.add('selected');
      }
      generateBtn.disabled = selectedPages.size === 0;
    });

    pagesContainer.appendChild(pageWrapper);
  }

  generateBtn.disabled = true;
  downloadLink.style.display = 'none';
});

generateBtn.addEventListener('click', async () => {
  if (!pdfDoc || selectedPages.size === 0) return;

  generateBtn.disabled = true;
  generateBtn.classList.add('loading');
  downloadLink.style.display = 'none';

  try {
    const pdfLibDoc = await PDFLib.PDFDocument.create();

    // Load original PDF bytes
    const originalPdfBytes = await pdfUpload.files[0].arrayBuffer();
    const originalPdfDoc = await PDFLib.PDFDocument.load(originalPdfBytes);

    // Copy selected pages to new PDF
    const pagesToCopy = Array.from(selectedPages).sort((a, b) => a - b);
    const copiedPages = await pdfLibDoc.copyPages(originalPdfDoc, pagesToCopy.map(p => p - 1));
    copiedPages.forEach((page) => {
      pdfLibDoc.addPage(page);
    });

    const pdfBytes = await pdfLibDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    downloadLink.style.display = 'inline-block';
  } catch (error) {
    alert('An error occurred while generating the PDF. Please try again.');
    console.error(error);
  } finally {
    generateBtn.disabled = false;
    generateBtn.classList.remove('loading');
  }
});
