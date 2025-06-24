document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const textContent = document.getElementById('text-content');
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const voiceSelect = document.getElementById('voice-select');

    let speechSynthesisUtterance;
    let isPaused = false;
    let wordSpans = [];
    let currentWordIndex = -1;
    let voices = [];

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
        voices = speechSynthesis.getVoices();
        voiceSelect.innerHTML = '';
        voices.forEach((voice, index) => {
            const option = document.createElement('option');
            option.textContent = `${voice.name} (${voice.lang})${voice.default ? ' [default]' : ''}`;
            option.value = index;
            voiceSelect.appendChild(option);
        });
    }

    populateVoiceList();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file || file.type !== 'application/pdf') {
            alert('Please select a valid PDF file.');
            return;
        }
        const startPageInput = document.getElementById('start-page');
        const endPageInput = document.getElementById('end-page');
        textContent.textContent = 'Loading PDF...';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;

        let startPage = parseInt(startPageInput.value);
        let endPage = parseInt(endPageInput.value);
        if (isNaN(startPage) || startPage < 1) startPage = 1;
        if (isNaN(endPage) || endPage > pdf.numPages) endPage = pdf.numPages;
        if (startPage > endPage) {
            alert('Start page cannot be greater than end page.');
            textContent.textContent = '';
            return;
        }
        startPageInput.max = pdf.numPages;
        endPageInput.max = pdf.numPages;
        startPageInput.value = startPage;
        endPageInput.value = endPage;

        let fullText = '';
        for (let i = startPage; i <= endPage; i++) {
            const page = await pdf.getPage(i);
            const textContentObj = await page.getTextContent();
            const pageText = textContentObj.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }
        // Split text into words and wrap each in a span
        const words = fullText.trim().split(/\s+/);
        textContent.innerHTML = words.map((word, idx) => `<span data-index="${idx}">${word} </span>`).join('');
        wordSpans = Array.from(textContent.querySelectorAll('span'));
        playBtn.disabled = false;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        cancelBtn.disabled = true;
        currentWordIndex = -1;
    });

    playBtn.addEventListener('click', () => {
        if (!wordSpans.length) return;
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }
        const textToSpeak = wordSpans.map(span => span.textContent).join('');
        speechSynthesisUtterance = new SpeechSynthesisUtterance(textToSpeak);
        currentWordIndex = -1;

        // Set selected voice
        const selectedVoiceIndex = parseInt(voiceSelect.value);
        if (!isNaN(selectedVoiceIndex) && voices[selectedVoiceIndex]) {
            speechSynthesisUtterance.voice = voices[selectedVoiceIndex];
        }

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
