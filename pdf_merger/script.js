const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('pdf-upload');
const previewContainer = document.getElementById('preview-container');
const statusBar = document.getElementById('status-bar');
const fileCountSpan = document.getElementById('file-count');
const selectionCountSpan = document.getElementById('selection-count');
const mergeBtn = document.getElementById('merge-btn');
const clearBtn = document.getElementById('clear-all');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');

let loadedFiles = []; // Array of { id, name, data (ArrayBuffer), pdf (pdfjs proxy) }
let allPages = []; // Array of { id (unique), fileId, pageIndex, selected }
let fileCounter = 0;

// Initialize
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
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

clearBtn.addEventListener('click', () => {
    location.reload();
});

mergeBtn.addEventListener('click', mergePages);

async function handleFiles(files) {
    if (files.length === 0) return;

    showLoader('Processing PDFs...');

    // Process each file
    for (const file of files) {
        if (file.type !== 'application/pdf') continue;

        try {
            const arrayBuffer = await file.arrayBuffer();
            // Clone the buffer because PDF.js might transfer/detach it to the worker
            const pdf = await pdfjsLib.getDocument(arrayBuffer.slice(0)).promise;

            const fileId = `file_${fileCounter++}`;

            loadedFiles.push({
                id: fileId,
                name: file.name,
                data: arrayBuffer,
                pdf: pdf,
                pageCount: pdf.numPages
            });

            // Render pages for this file
            await renderPages(fileId, pdf, file.name);

        } catch (error) {
            console.error('Error loading PDF:', error);
            alert(`Could not load ${file.name}`);
        }
    }

    updateStats();
    statusBar.classList.remove('hidden');
    hideLoader();
}

async function renderPages(fileId, pdf, fileName) {
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.5 }); // Thumbnail scale

        const uniquePageId = `${fileId}_p${i}`;

        // Create DOM elements
        const card = document.createElement('div');
        card.className = 'page-card';
        card.dataset.id = uniquePageId;
        card.onclick = () => toggleSelection(uniquePageId);

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        const checkMarker = document.createElement('div');
        checkMarker.className = 'check-marker';
        checkMarker.innerHTML = '✓';

        const info = document.createElement('div');
        info.className = 'page-info';
        // Shorten filename if too long
        const shortName = fileName.length > 15 ? fileName.substring(0, 12) + '...' : fileName;
        info.innerHTML = `<span>${shortName}</span> <span>Pg ${i}</span>`;

        card.appendChild(checkMarker);
        card.appendChild(canvas);
        card.appendChild(info);
        previewContainer.appendChild(card);

        // Render PDF page
        await page.render(renderContext).promise;

        // Add to tracking
        allPages.push({
            id: uniquePageId,
            fileId: fileId,
            pageIndex: i - 1, // 0-based for pdf-lib
            selected: false,
            element: card
        });
    }
}

function toggleSelection(pageId) {
    const pageObj = allPages.find(p => p.id === pageId);
    if (!pageObj) return;

    pageObj.selected = !pageObj.selected;

    if (pageObj.selected) {
        pageObj.element.classList.add('selected');
    } else {
        pageObj.element.classList.remove('selected');
    }

    updateStats();
}

function updateStats() {
    fileCountSpan.textContent = loadedFiles.length + (loadedFiles.length === 1 ? ' file' : ' files');
    const selectedCount = allPages.filter(p => p.selected).length;
    selectionCountSpan.textContent = selectedCount + (selectedCount === 1 ? ' page' : ' pages') + ' selected';

    mergeBtn.disabled = selectedCount === 0;
}

async function mergePages() {
    const selectedPages = allPages.filter(p => p.selected);
    if (selectedPages.length === 0) return;

    showLoader('Merging pages...');

    try {
        const { PDFDocument } = PDFLib;
        const newPdf = await PDFDocument.create();

        // Group pages by file to minimize loading
        // We actually have the ArrayBuffers in loadedFiles
        // We'll proceed in selection order to maintain user's implied order? 
        // Or should we maintain file order?
        // Let's stick to the visual order in the grid (which is input order) unless we implement reordering.
        // User asked "display all pages... and select... generate separate pdf".
        // Usually merging implies preserving selection order or document order. 
        // Since we iterate through `allPages` which preserves grid order, we are good.

        // We need to load user's files into pdf-lib Documents
        // Cache them to avoid reparsing for every page
        const pdfLibDocs = {}; // Map fileId -> PDFLib Document

        for (const p of selectedPages) {
            const fileData = loadedFiles.find(f => f.id === p.fileId);

            if (!pdfLibDocs[p.fileId]) {
                pdfLibDocs[p.fileId] = await PDFDocument.load(fileData.data, { ignoreEncryption: true });
            }

            const srcDoc = pdfLibDocs[p.fileId];
            const [copiedPage] = await newPdf.copyPages(srcDoc, [p.pageIndex]);
            newPdf.addPage(copiedPage);
        }

        const pdfBytes = await newPdf.save();
        downloadPdf(pdfBytes);

    } catch (error) {
        console.error('Merge error:', error);
        alert('Failed to merge PDF. See console for details.');
    } finally {
        hideLoader();
    }
}

function downloadPdf(pdfBytes) {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'merged_pages.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showLoader(text) {
    if (text) loaderText.textContent = text;
    loader.classList.remove('hidden');
}

function hideLoader() {
    loader.classList.add('hidden');
}
