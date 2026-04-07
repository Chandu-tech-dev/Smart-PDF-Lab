document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const textContent = document.getElementById('text-content');
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const extractBtn = document.getElementById('extract-btn');
    const fileNameLabel = document.getElementById('file-name');
    const voiceSelect = document.getElementById('voice-select');
    const langFilter = document.getElementById('lang-filter');
    const rateRange = document.getElementById('rate-range');
    const pitchRange = document.getElementById('pitch-range');
    const rateVal = document.getElementById('rate-val');
    const pitchVal = document.getElementById('pitch-val');
    const detectedLangBadge = document.getElementById('detected-lang');
    const langWarning = document.getElementById('lang-warning');

    let selectedFile = null; // holds the chosen PDF file

    let utterance;
    let isPaused = false;
    let wordSpans = [];
    let currentWordIndex = -1;
    let voices = [];
    let allVoices = [];
    let detectedLang = '';
    let usingRV = false; // true when ResponsiveVoice is active

    // ─── ResponsiveVoice language map ────────────────────────────────────────
    // Maps ISO lang code → ResponsiveVoice voice name
    const RV_VOICES = {
        'kn': 'Kannada Female',
        'ta': 'Tamil Female',
        'te': 'Telugu Female',
        'ml': 'Malayalam Female',
        'bn': 'Bengali Female',
        'gu': 'Gujarati Female',
        'pa': 'Punjabi Female',
        'mr': 'Marathi Female',
        'hi': 'Hindi Female',
        'ur': 'Urdu Female',
        'th': 'Thai Female',
        'ar': 'Arabic Female',
        'he': 'Hebrew Female',
        'id': 'Indonesian Female',
        'ms': 'Malay Female',
        'vi': 'Vietnamese Female',
        'el': 'Greek Female',
    };

    function rvAvailable() {
        return (typeof responsiveVoice !== 'undefined') && responsiveVoice.voiceSupport();
    }

    function getRVVoiceName(langCode) {
        const base = (langCode || '').split('-')[0];
        return RV_VOICES[base] || null;
    }

    // ─── Language name map ───────────────────────────────────────────────────
    const LANG_NAMES = new Intl.DisplayNames(['en'], { type: 'language' });

    function getLangName(langCode) {
        try {
            const base = langCode.split('-')[0];
            return LANG_NAMES.of(base) || langCode;
        } catch {
            return langCode;
        }
    }

    // ─── Simple language detector via Unicode range ──────────────────────────
    const SCRIPT_PATTERNS = [
        { lang: 'hi', regex: /[\u0900-\u097F]/, label: 'Hindi' },
        { lang: 'ar', regex: /[\u0600-\u06FF]/, label: 'Arabic' },
        { lang: 'zh', regex: /[\u4E00-\u9FFF\u3400-\u4DBF]/, label: 'Chinese' },
        { lang: 'ja', regex: /[\u3040-\u309F\u30A0-\u30FF]/, label: 'Japanese' },
        { lang: 'ko', regex: /[\uAC00-\uD7AF]/, label: 'Korean' },
        { lang: 'ta', regex: /[\u0B80-\u0BFF]/, label: 'Tamil' },
        { lang: 'te', regex: /[\u0C00-\u0C7F]/, label: 'Telugu' },
        { lang: 'kn', regex: /[\u0C80-\u0CFF]/, label: 'Kannada' },
        { lang: 'ml', regex: /[\u0D00-\u0D7F]/, label: 'Malayalam' },
        { lang: 'gu', regex: /[\u0A80-\u0AFF]/, label: 'Gujarati' },
        { lang: 'pa', regex: /[\u0A00-\u0A7F]/, label: 'Punjabi' },
        { lang: 'bn', regex: /[\u0980-\u09FF]/, label: 'Bengali' },
        { lang: 'or', regex: /[\u0B00-\u0B7F]/, label: 'Odia' },
        { lang: 'ur', regex: /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/, label: 'Urdu' },
        { lang: 'th', regex: /[\u0E00-\u0E7F]/, label: 'Thai' },
        { lang: 'ru', regex: /[\u0400-\u04FF]/, label: 'Russian/Cyrillic' },
        { lang: 'el', regex: /[\u0370-\u03FF]/, label: 'Greek' },
        { lang: 'he', regex: /[\u0590-\u05FF]/, label: 'Hebrew' },
        { lang: 'fr', regex: /[àâçéèêëîïôùûüÿœæ]/i, label: 'French' },
        { lang: 'de', regex: /[äöüßÄÖÜ]/, label: 'German' },
        { lang: 'es', regex: /[áéíóúñ¿¡]/i, label: 'Spanish' },
        { lang: 'pt', regex: /[ãõâêôçà]/i, label: 'Portuguese' },
    ];

    function detectLanguage(text) {
        const sample = text.slice(0, 2000);
        for (const { lang, regex } of SCRIPT_PATTERNS) {
            const matches = (sample.match(new RegExp(regex.source, 'g')) || []).length;
            if (matches > 10) return lang;
        }
        return 'en'; // default English
    }

    // ─── Word splitting (handles CJK characters individually) ───────────────
    function splitIntoWords(text) {
        // For CJK text, split character-by-character; for others split on whitespace
        const cjkRegex = /[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/;
        if (cjkRegex.test(text)) {
            return text.split('').filter(c => c.trim() !== '');
        }
        return text.trim().split(/\s+/).filter(w => w.length > 0);
    }

    // ─── Voice population & filtering ───────────────────────────────────────
    function populateVoiceList() {
        allVoices = speechSynthesis.getVoices();
        voices = allVoices;
        rebuildLangFilter();
        filterVoicesByLang(langFilter ? langFilter.value : '');
    }

    function rebuildLangFilter() {
        if (!langFilter) return;
        const currentVal = langFilter.value;
        const uniqueLangs = [...new Set(allVoices.map(v => v.lang.split('-')[0]))].sort();

        langFilter.innerHTML = '<option value="">🌐 All Languages</option>';
        uniqueLangs.forEach(lang => {
            const opt = document.createElement('option');
            opt.value = lang;
            opt.textContent = `${getLangName(lang)} (${lang})`;
            langFilter.appendChild(opt);
        });

        // Try to restore
        if (currentVal) langFilter.value = currentVal;
    }

    function filterVoicesByLang(langCode) {
        voices = langCode
            ? allVoices.filter(v => v.lang.startsWith(langCode))
            : allVoices;

        voiceSelect.innerHTML = '';
        if (voices.length === 0) {
            const opt = document.createElement('option');
            opt.textContent = '⚠️ No voices for this language on your system';
            opt.disabled = true;
            voiceSelect.appendChild(opt);
            showLangWarning(langCode);
        } else {
            hideLangWarning();
            voices.forEach((voice, index) => {
                const opt = document.createElement('option');
                opt.textContent = `${voice.name} (${voice.lang})${voice.default ? ' ★' : ''}`;
                opt.value = index;
                voiceSelect.appendChild(opt);
            });
        }
    }

    function showLangWarning(langCode) {
        if (!langWarning) return;
        langWarning.innerHTML = `
            ⚠️ No installed voice found for <strong>${getLangName(langCode)}</strong>. 
            Please install a <strong>${getLangName(langCode)}</strong> TTS voice from your OS settings, 
            or choose a different language from the filter.`;
        langWarning.style.display = 'block';
    }

    function hideLangWarning() {
        if (!langWarning) return;
        langWarning.style.display = 'none';
    }

    // ─── Auto-select voice matching detected language ────────────────────────
    function autoSelectVoiceForLang(langCode) {
        if (!langCode || !langFilter) return;

        // Set filter dropdown
        const matchingOption = [...langFilter.options].find(opt =>
            opt.value === langCode || langCode.startsWith(opt.value)
        );
        if (matchingOption) {
            langFilter.value = matchingOption.value;
            filterVoicesByLang(matchingOption.value);
        }

        // Select the best matching voice in voiceSelect
        const matchIdx = voices.findIndex(v => v.lang.startsWith(langCode));
        if (matchIdx >= 0) voiceSelect.value = matchIdx;
    }

    populateVoiceList();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }

    // ─── Language filter change ──────────────────────────────────────────────
    if (langFilter) {
        langFilter.addEventListener('change', () => {
            filterVoicesByLang(langFilter.value);
        });
    }

    // ─── Rate & Pitch sliders ────────────────────────────────────────────────
    if (rateRange && rateVal) {
        rateRange.addEventListener('input', () => {
            rateVal.textContent = parseFloat(rateRange.value).toFixed(1) + '×';
        });
    }
    if (pitchRange && pitchVal) {
        pitchRange.addEventListener('input', () => {
            pitchVal.textContent = parseFloat(pitchRange.value).toFixed(1);
        });
    }

    // ─── Highlighting helper ─────────────────────────────────────────────────
    function clearHighlight() {
        if (currentWordIndex >= 0 && wordSpans[currentWordIndex]) {
            wordSpans[currentWordIndex].classList.remove('highlight');
        }
    }

    function highlightWord(index) {
        clearHighlight();
        if (wordSpans[index]) {
            wordSpans[index].classList.add('highlight');
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

    // ─── Drag & Drop ─────────────────────────────────────────────────────────
    const dropZone = document.getElementById('drop-zone');
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            fileInput.dispatchEvent(new Event('change'));
        }
    });

    // ─── File select: store file, show name, enable Extract button ───────────
    function handleFileSelected(file) {
        if (!file || file.type !== 'application/pdf') {
            alert('Please select a valid PDF file.');
            return;
        }
        selectedFile = file;
        if (fileNameLabel) {
            fileNameLabel.textContent = `📂 ${file.name}`;
            fileNameLabel.classList.add('has-file');
        }
        if (extractBtn) extractBtn.disabled = false;

        // Reset previous extraction state
        wordSpans = [];
        currentWordIndex = -1;
        textContent.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Click <strong>Extract Text</strong> to read this PDF…</p>';
        if (detectedLangBadge) detectedLangBadge.style.display = 'none';
        hideLangWarning();
        playBtn.disabled = true;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        cancelBtn.disabled = false; // allow clearing the selection
    }

    fileInput.addEventListener('change', (event) => {
        if (!event.target.files.length) return;
        handleFileSelected(event.target.files[0]);
    });

    // ─── Extract button: read pages & build word spans ────────────────────────
    if (extractBtn) {
        extractBtn.addEventListener('click', async () => {
            if (!selectedFile) return;

            const startPageInput = document.getElementById('start-page');
            const endPageInput = document.getElementById('end-page');

            extractBtn.disabled = true;
            extractBtn.textContent = '⏳ Extracting…';
            textContent.textContent = 'Loading PDF…';

            try {
                const arrayBuffer = await selectedFile.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

                let startPage = parseInt(startPageInput.value);
                let endPage = parseInt(endPageInput.value);
                if (isNaN(startPage) || startPage < 1) startPage = 1;
                if (isNaN(endPage) || endPage > pdf.numPages) endPage = pdf.numPages;
                if (startPage > endPage) {
                    alert('Start page cannot be greater than end page.');
                    textContent.textContent = '';
                    extractBtn.disabled = false;
                    extractBtn.textContent = '📄 Extract Text';
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
                    const pageText = textContentObj.items
                        .map(item => item.str + (item.hasEOL ? '\n' : ' '))
                        .join('');
                    fullText += pageText + '\n\n';
                }

                if (!fullText.trim()) {
                    textContent.innerHTML = '<p style="text-align:center;color:var(--text-muted);">⚠️ No readable text found. This PDF may be image-based.</p>';
                    extractBtn.disabled = false;
                    extractBtn.textContent = '📄 Extract Text';
                    return;
                }

                // Detect language & update badge
                detectedLang = detectLanguage(fullText);
                if (detectedLangBadge) {
                    detectedLangBadge.textContent = `🌐 Detected: ${getLangName(detectedLang)} (${detectedLang})`;
                    detectedLangBadge.style.display = 'inline-block';
                }

                // RTL support
                const rtlLangs = ['ar', 'he', 'ur', 'fa'];
                textContent.style.direction = rtlLangs.includes(detectedLang) ? 'rtl' : 'ltr';
                textContent.style.textAlign = rtlLangs.includes(detectedLang) ? 'right' : 'left';

                // Build word spans
                const words = splitIntoWords(fullText.trim());
                textContent.innerHTML = words
                    .map((word, idx) => `<span data-index="${idx}">${word} </span>`)
                    .join('');
                wordSpans = Array.from(textContent.querySelectorAll('span'));

                // Auto-select best voice
                autoSelectVoiceForLang(detectedLang);

                playBtn.disabled = false;
                pauseBtn.disabled = true;
                resumeBtn.disabled = true;
                cancelBtn.disabled = false;
                currentWordIndex = -1;

                extractBtn.textContent = '✅ Extracted';
                // keep extract enabled so user can re-extract with different page range
                extractBtn.disabled = false;

            } catch (err) {
                console.error('PDF extraction error:', err);
                textContent.innerHTML = '<p style="text-align:center;color:#f87171;">❌ Failed to read PDF. Please try another file.</p>';
                extractBtn.disabled = false;
                extractBtn.textContent = '📄 Extract Text';
            }
        });
    }

    // ─── Play ────────────────────────────────────────────────────────────────
    playBtn.addEventListener('click', () => {
        if (!wordSpans.length) return;
        if (speechSynthesis.speaking) speechSynthesis.cancel();
        if (usingRV && rvAvailable()) responsiveVoice.cancel();
        usingRV = false;

        const textToSpeak = wordSpans.map(span => span.textContent).join('');
        currentWordIndex = -1;

        // Determine active voice & lang
        const selectedVoiceIndex = parseInt(voiceSelect.value);
        const hasNativeVoice = !isNaN(selectedVoiceIndex) && voices[selectedVoiceIndex];
        const activeLang = hasNativeVoice
            ? voices[selectedVoiceIndex].lang
            : (detectedLang || 'en');

        const rvVoiceName = getRVVoiceName(activeLang);
        const useRV = !hasNativeVoice && rvAvailable() && rvVoiceName;

        if (useRV) {
            // ── ResponsiveVoice path ─────────────────────────────────────────
            usingRV = true;
            const rate = rateRange ? parseFloat(rateRange.value) : 1;
            const pitch = pitchRange ? parseFloat(pitchRange.value) : 1;

            // Simple sequential word-highlight via a timer (RV has no onboundary)
            let rvWordIndex = 0;
            const avgMsPerWord = Math.max(200, 400 / rate);

            const rvHighlighter = setInterval(() => {
                if (rvWordIndex < wordSpans.length) {
                    highlightWord(rvWordIndex++);
                } else {
                    clearInterval(rvHighlighter);
                }
            }, avgMsPerWord);

            responsiveVoice.speak(textToSpeak, rvVoiceName, {
                rate,
                pitch,
                onstart: () => {
                    playBtn.disabled = true;
                    pauseBtn.disabled = false;
                    resumeBtn.disabled = true;
                    cancelBtn.disabled = false;
                    isPaused = false;
                },
                onend: () => {
                    clearInterval(rvHighlighter);
                    clearHighlight();
                    playBtn.disabled = false;
                    pauseBtn.disabled = true;
                    resumeBtn.disabled = true;
                    cancelBtn.disabled = true;
                    usingRV = false;
                },
                onerror: () => {
                    clearInterval(rvHighlighter);
                    clearHighlight();
                    alert('ResponsiveVoice failed. Please check your internet connection.');
                    playBtn.disabled = false;
                    pauseBtn.disabled = true;
                    resumeBtn.disabled = true;
                    cancelBtn.disabled = true;
                    usingRV = false;
                }
            });

        } else {
            // ── Native Web Speech API path ───────────────────────────────────
            utterance = new SpeechSynthesisUtterance(textToSpeak);

            if (hasNativeVoice) {
                utterance.voice = voices[selectedVoiceIndex];
                utterance.lang = voices[selectedVoiceIndex].lang;
            } else if (detectedLang) {
                utterance.lang = detectedLang;
            }

            utterance.rate = rateRange ? parseFloat(rateRange.value) : 1;
            utterance.pitch = pitchRange ? parseFloat(pitchRange.value) : 1;

            utterance.onboundary = (event) => {
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

            utterance.onpause = () => {
                isPaused = true;
                pauseBtn.disabled = true;
                resumeBtn.disabled = false;
            };

            utterance.onresume = () => {
                isPaused = false;
                pauseBtn.disabled = false;
                resumeBtn.disabled = true;
            };

            utterance.onend = () => {
                clearHighlight();
                playBtn.disabled = false;
                pauseBtn.disabled = true;
                resumeBtn.disabled = true;
                cancelBtn.disabled = true;
            };

            utterance.onerror = (e) => {
                console.warn('SpeechSynthesis error:', e.error);
                if (e.error !== 'interrupted') {
                    alert(`Speech error: ${e.error}. Try selecting a different voice or language.`);
                }
                playBtn.disabled = false;
                pauseBtn.disabled = true;
                resumeBtn.disabled = true;
                cancelBtn.disabled = true;
            };

            speechSynthesis.speak(utterance);
            playBtn.disabled = true;
            pauseBtn.disabled = false;
            resumeBtn.disabled = true;
            cancelBtn.disabled = false;
            isPaused = false;
        }
    });

    // ─── Pause / Resume / Cancel ─────────────────────────────────────────────
    pauseBtn.addEventListener('click', () => {
        if (usingRV && rvAvailable()) {
            responsiveVoice.pause();
            isPaused = true;
            pauseBtn.disabled = true;
            resumeBtn.disabled = false;
        } else if (speechSynthesis.speaking && !isPaused) {
            speechSynthesis.pause();
            isPaused = true;
            pauseBtn.disabled = true;
            resumeBtn.disabled = false;
        }
    });

    resumeBtn.addEventListener('click', () => {
        if (usingRV && rvAvailable() && isPaused) {
            responsiveVoice.resume();
            isPaused = false;
            pauseBtn.disabled = false;
            resumeBtn.disabled = true;
        } else if (isPaused) {
            speechSynthesis.resume();
            isPaused = false;
            pauseBtn.disabled = false;
            resumeBtn.disabled = true;
        }
    });

    cancelBtn.addEventListener('click', () => {
        if (speechSynthesis.speaking) speechSynthesis.cancel();
        if (usingRV && rvAvailable()) responsiveVoice.cancel();
        usingRV = false;
        clearHighlight();
        selectedFile = null;
        textContent.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Extracted text will appear here…</p>';
        fileInput.value = '';
        if (fileNameLabel) { fileNameLabel.textContent = 'No file selected'; fileNameLabel.classList.remove('has-file'); }
        if (extractBtn) { extractBtn.disabled = true; extractBtn.textContent = '📄 Extract Text'; }
        document.getElementById('start-page').value = 1;
        document.getElementById('end-page').value = 1;
        if (rateRange) rateRange.value = 1;
        if (pitchRange) pitchRange.value = 1;
        if (rateVal) rateVal.textContent = '1.0×';
        if (pitchVal) pitchVal.textContent = '1.0';
        if (detectedLangBadge) detectedLangBadge.style.display = 'none';
        hideLangWarning();
        if (langFilter) { langFilter.value = ''; filterVoicesByLang(''); }
        voiceSelect.selectedIndex = 0;
        playBtn.disabled = true;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        cancelBtn.disabled = true;
        isPaused = false;
        wordSpans = [];
        currentWordIndex = -1;
        detectedLang = '';
        textContent.style.direction = 'ltr';
        textContent.style.textAlign = 'left';
    });
});
