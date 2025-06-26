pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.9.179/pdf.worker.min.js';

document.getElementById('file-input').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const startPageInput = document.getElementById('start-page');
  const endPageInput = document.getElementById('end-page');
  let startPage = parseInt(startPageInput.value, 10);
  let endPage = parseInt(endPageInput.value, 10);

  if (isNaN(startPage) || startPage < 1) {
    startPage = 1;
  }
  if (isNaN(endPage) || endPage < startPage) {
    endPage = startPage;
  }

  const fileReader = new FileReader();

  fileReader.onload = async function() {
    const typedarray = new Uint8Array(this.result);

    try {
      const pdf = await pdfjsLib.getDocument(typedarray).promise;
      const maxPage = pdf.numPages;
      if (endPage > maxPage) {
        endPage = maxPage;
        endPageInput.value = maxPage;
      }

      let fullText = '';
      for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';
      }

      // Set extracted text in the div for translation
      const inputTextArea = document.getElementById('inputText');
      inputTextArea.innerText = fullText;

    } catch (error) {
      console.error('Error extracting PDF text:', error);
      alert('Failed to extract text from PDF. Please try another file.');
    }
  };

  fileReader.readAsArrayBuffer(file);
});
