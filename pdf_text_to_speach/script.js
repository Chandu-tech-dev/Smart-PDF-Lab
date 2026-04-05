document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const textContent = document.getElementById('text-content');
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const voiceSelect = document.getElementById('voice-select');
    const extractBtn = document.getElementById('extract-btn');
    const startPageInput = document.getElementById('start-page');
    const endPageInput = document.getElementById('end-page');
    const rateInput = document.getElementById('rate');
    const pitchInput = document.getElementById('pitch');
    const rateValue = document.getElementById('rate-value');
    const pitchValue = document.getElementById('pitch-value');

    let speechSynthesisUtterance;
    let isPaused = false;
    let wordSpans = [];
    let currentWordIndex = -1;
    let voices = [];
    let pdfDocument = null;

    // ─────────────────────────────────────────────────────────────────
    // MULTILINGUAL AUTO-DETECTION ENGINE
    // Automatically detects the language of the PDF and selects the best TTS voice
    // ─────────────────────────────────────────────────────────────────
    function detectLanguage(text) {
        if (!text) return 'en-US';
        
        let arabic = 0, hindi = 0, chinese = 0, japanese = 0, korean = 0, russian = 0, hebrew = 0;
        for (let i = 0; i < Math.min(text.length, 1000); i++) {
            let code = text.charCodeAt(i);
            if (code >= 0x0600 && code <= 0x06FF) arabic++;
            else if (code >= 0x0900 && code <= 0x097F) hindi++;
            else if (code >= 0x4E00 && code <= 0x9FFF) chinese++;
            else if (code >= 0x3040 && code <= 0x30FF) japanese++;
            else if (code >= 0xAC00 && code <= 0xD7AF) korean++;
            else if (code >= 0x0400 && code <= 0x04FF) russian++;
            else if (code >= 0x0590 && code <= 0x05FF) hebrew++;
        }
        
        const max = Math.max(arabic, hindi, chinese, japanese, korean, russian, hebrew);
        if (max > 10) {
            if (max === arabic) return 'ar';
            if (max === hindi) return 'hi';
            if (max === chinese) return 'zh';
            if (max === japanese) return 'ja';
            if (max === korean) return 'ko';
            if (max === russian) return 'ru';
            if (max === hebrew) return 'he';
        }
        
        // Latin scripts
        const sample = text.substring(0, 1000).toLowerCase();
        if (sample.match(/\b(el|la|los|de|que|y|en|un|una)\b/g)?.length > 3) return 'es';
        if (sample.match(/\b(le|la|les|de|du|des|est|une|un)\b/g)?.length > 3) return 'fr';
        if (sample.match(/\b(und|die|der|das|ist|ein)\b/g)?.length > 3) return 'de';
        if (sample.match(/\b(il|la|di|è|un|una|che)\b/g)?.length > 3) return 'it';
        if (sample.match(/\b(de|do|da|que|o|a|os|as)\b/g)?.length > 3) return 'pt';
        
        return 'en';
    }

    function clearHighlight() {
        if (currentWordIndex >= 0 && wordSpans[currentWordIndex]) {
            wordSpans[currentWordIndex].classList.remove('highlight');
        }
    }

    function highlightWord(index) {
        clearHighlight();
        if (wordSpans[index]) {
            wordSpans[index].classList.add('highlight');
            // Scroll into view if needed
            const containerTop = textContent.scrollTop;
            const containerBottom = containerTop + textContent.clientHeight;
            const wordTop = wordSpans[index].offsetTop;
            const wordBottom = wordTop + wordSpans[index].offsetHeight;
            if (wordTop < containerTop) {
                textContent.scrollTop = wordTop;
            } else if (wordBottom > containerBottom) {
                textContent.scrollTop = wordBottom - textContent.clientHeight;
            }
            currentWordIndex = index;
        }
    }

    function populateVoiceList() {
        // Get voices and sort to prioritize Google/Microsoft ones which are often clearer
        voices = speechSynthesis.getVoices().sort(function (a, b) {
            const aname = a.name.toUpperCase(), bname = b.name.toUpperCase();
            if (aname.includes("GOOGLE") || aname.includes("MICROSOFT")) return -1;
            if (bname.includes("GOOGLE") || bname.includes("MICROSOFT")) return 1;
            if (aname < bname) return -1;
            else if (aname == bname) return 0;
            return +1;
        });

        voiceSelect.innerHTML = '';
        voices.forEach((voice, index) => {
            const option = document.createElement('option');
            option.textContent = `${voice.name} (${voice.lang})`;
            // Attempt to select a good default English voice
            if (voice.default) option.textContent += ' -- DEFAULT';
            option.setAttribute('data-lang', voice.lang);
            option.setAttribute('data-name', voice.name);
            option.value = index;
            voiceSelect.appendChild(option);
        });

        // Try to auto-select Google US English if available and nothing selected
        if (voiceSelect.selectedIndex < 0) {
            const googleVoiceIndex = voices.findIndex(v => v.name.includes("Google US English"));
            if (googleVoiceIndex >= 0) voiceSelect.selectedIndex = googleVoiceIndex;
        }
    }

    populateVoiceList();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }

    const dropZone = document.getElementById('drop-zone');

    // Drag and Drop Logic
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

    fileInput.addEventListener('change', async (event) => {
        if (event.target.files.length === 0) return;
        const file = event.target.files[0];
        if (!file || file.type !== 'application/pdf') {
            alert('Please select a valid PDF file.');
            return;
        }

        textContent.textContent = 'Loading PDF...';
        const arrayBuffer = await file.arrayBuffer();
        try {
            pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            // Set input max values
            startPageInput.max = pdfDocument.numPages;
            endPageInput.max = pdfDocument.numPages;
            startPageInput.value = 1;
            endPageInput.value = pdfDocument.numPages;

            textContent.textContent = `PDF Loaded (${pdfDocument.numPages} pages). Select pages and click 'Extract Text'.`;
            extractBtn.disabled = false;

            // Disable other controls until extraction
            playBtn.disabled = true;
            pauseBtn.disabled = true;
            resumeBtn.disabled = true;
            cancelBtn.disabled = true;
        } catch (err) {
            console.error(err);
            textContent.textContent = "Error loading PDF.";
        }
    });

    extractBtn.addEventListener('click', async () => {
        if (!pdfDocument) return;

        let startPage = parseInt(startPageInput.value);
        let endPage = parseInt(endPageInput.value);

        if (isNaN(startPage) || startPage < 1) startPage = 1;
        if (isNaN(endPage) || endPage > pdfDocument.numPages) endPage = pdfDocument.numPages;

        if (startPage > endPage) {
            alert('Start page cannot be greater than end page.');
            return;
        }

        extractBtn.disabled = true;
        textContent.textContent = 'Extracting text...';

        let fullText = '';
        try {
            for (let i = startPage; i <= endPage; i++) {
                const page = await pdfDocument.getPage(i);
                // Trust native PDF.js for extraction (supports all languages/bidi intrinsically)
                const textContentObj = await page.getTextContent();
                
                let pageText = '';
                let lastY = null;
                for (let item of textContentObj.items) {
                    if (lastY !== null && Math.abs(lastY - item.transform[5]) > 5) {
                        pageText += '\n'; // Add line break if Y position changes significantly
                    }
                    pageText += item.str;
                    if (item.hasEOL) {
                        pageText += '\n';
                    }
                    lastY = item.transform[5];
                }
                
                fullText += pageText + '\n\n';
            }

            // Clean up text spacing while preserving line breaks
            fullText = fullText.replace(/ +\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

            if (!fullText) {
                textContent.textContent = "No text found in selected pages.";
                extractBtn.disabled = false;
                return;
            }

            // Auto-detect language and set voice
            const detectedLang = detectLanguage(fullText);
            let bestIndex = -1;
            
            // Try to find premium voice for language
            for (let i = 0; i < voices.length; i++) {
                if (voices[i].lang.toLowerCase().startsWith(detectedLang)) {
                    if (voices[i].name.toLowerCase().includes('google') || voices[i].name.toLowerCase().includes('microsoft')) {
                        bestIndex = i;
                        break;
                    }
                    if (bestIndex === -1) bestIndex = i; // Fallback to first matching voice
                }
            }
            if (bestIndex !== -1) {
                voiceSelect.selectedIndex = bestIndex;
            }

            // Split into tokens preserving newlines as separate tokens
            const words = fullText.split(/( |\n)/g).filter(w => w.length > 0);

            textContent.innerHTML = words.map((word, idx) => {
                if (word === '\n') return '<br>';
                return `<span data-index="${idx}">${word} </span>`;
            }).join('');
            wordSpans = Array.from(textContent.querySelectorAll('span'));

            playBtn.disabled = false;
            pauseBtn.disabled = true;
            resumeBtn.disabled = true;
            cancelBtn.disabled = true;
            currentWordIndex = -1;
            extractBtn.disabled = false;

        } catch (err) {
            console.error(err);
            textContent.textContent = "Error extracting text.";
            extractBtn.disabled = false;
        }
    });

    // Update rate/pitch labels
    rateInput.addEventListener('input', () => rateValue.textContent = rateInput.value);
    pitchInput.addEventListener('input', () => pitchValue.textContent = pitchInput.value);

    playBtn.addEventListener('click', () => {
        if (!wordSpans.length) return;
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }

        // Re-construct text from spans to ensure sync
        const textToSpeak = wordSpans.map(span => span.textContent).join('');
        speechSynthesisUtterance = new SpeechSynthesisUtterance(textToSpeak);

        // Apply Clarity Settings
        const selectedVoiceIndex = parseInt(voiceSelect.value);
        if (!isNaN(selectedVoiceIndex) && voices[selectedVoiceIndex]) {
            speechSynthesisUtterance.voice = voices[selectedVoiceIndex];
            speechSynthesisUtterance.lang = voices[selectedVoiceIndex].lang;
        }
        speechSynthesisUtterance.rate = parseFloat(rateInput.value);
        speechSynthesisUtterance.pitch = parseFloat(pitchInput.value);
        speechSynthesisUtterance.volume = 1;

        currentWordIndex = -1;

        speechSynthesisUtterance.onboundary = (event) => {
            if (event.name === 'word') {
                let charCount = 0;
                for (let i = 0; i < wordSpans.length; i++) {
                    charCount += wordSpans[i].textContent.length;
                    if (charCount > event.charIndex) {
                        highlightWord(i);
                        break;
                    }
                }
            }
        };

        speechSynthesisUtterance.onpause = () => {
            isPaused = true;
            pauseBtn.disabled = true;
            resumeBtn.disabled = false;
        };

        speechSynthesisUtterance.onresume = () => {
            isPaused = false;
            pauseBtn.disabled = false;
            resumeBtn.disabled = true;
        };

        speechSynthesisUtterance.onend = () => {
            clearHighlight();
            playBtn.disabled = false;
            pauseBtn.disabled = true;
            resumeBtn.disabled = true;
            cancelBtn.disabled = true;
        };

        speechSynthesis.speak(speechSynthesisUtterance);
        playBtn.disabled = true;
        pauseBtn.disabled = false;
        resumeBtn.disabled = true;
        cancelBtn.disabled = false;
        isPaused = false;
    });

    pauseBtn.addEventListener('click', () => {
        if (speechSynthesis.speaking && !isPaused) {
            speechSynthesis.pause();
            isPaused = true;
            pauseBtn.disabled = true;
            resumeBtn.disabled = false;
        }
    });

    resumeBtn.addEventListener('click', () => {
        if (isPaused) {
            speechSynthesis.resume();
            isPaused = false;
            pauseBtn.disabled = false;
            resumeBtn.disabled = true;
        }
    });

    cancelBtn.addEventListener('click', () => {
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }
        clearHighlight();
        textContent.innerHTML = "";
        fileInput.value = "";
        document.getElementById('start-page').value = 1;
        document.getElementById('end-page').value = 1;
        voiceSelect.selectedIndex = 0;
        playBtn.disabled = true;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        cancelBtn.disabled = true;
        isPaused = false;
        wordSpans = [];
        currentWordIndex = -1;
    });
});
