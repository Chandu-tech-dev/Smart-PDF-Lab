document.addEventListener('DOMContentLoaded', () => {
    const fileInput       = document.getElementById('file-input');
    const displayArea     = document.getElementById('text-content');   // renamed to avoid clash with pdf.js
    const playBtn         = document.getElementById('play-btn');
    const pauseBtn        = document.getElementById('pause-btn');
    const resumeBtn       = document.getElementById('resume-btn');
    const cancelBtn       = document.getElementById('cancel-btn');
    const voiceSelect     = document.getElementById('voice-select');
    const extractBtn      = document.getElementById('extract-btn');
    const startPageInput  = document.getElementById('start-page');
    const endPageInput    = document.getElementById('end-page');
    const rateInput       = document.getElementById('rate');
    const pitchInput      = document.getElementById('pitch');
    const rateValue       = document.getElementById('rate-value');
    const pitchValue      = document.getElementById('pitch-value');

    let utterance       = null;
    let isPaused        = false;
    let wordSpans       = [];
    let currentWordIdx  = -1;
    let voices          = [];
    let pdfDocument     = null;
    let detectedLangTag = 'en';   // BCP-47 primary subtag

    // ─── Highlight helpers ────────────────────────────────────────────
    function clearHighlight() {
        if (currentWordIdx >= 0 && wordSpans[currentWordIdx]) {
            wordSpans[currentWordIdx].classList.remove('highlight');
        }
    }

    function highlightWord(index) {
        clearHighlight();
        if (!wordSpans[index]) return;
        wordSpans[index].classList.add('highlight');
        const top    = wordSpans[index].offsetTop;
        const bottom = top + wordSpans[index].offsetHeight;
        if (top    < displayArea.scrollTop) displayArea.scrollTop = top;
        if (bottom > displayArea.scrollTop + displayArea.clientHeight)
            displayArea.scrollTop = bottom - displayArea.clientHeight;
        currentWordIdx = index;
    }

    // ─── Voice list ───────────────────────────────────────────────────
    function populateVoiceList() {
        voices = speechSynthesis.getVoices().sort((a, b) => {
            const an = a.name.toUpperCase(), bn = b.name.toUpperCase();
            const ap = an.includes('GOOGLE') || an.includes('MICROSOFT');
            const bp = bn.includes('GOOGLE') || bn.includes('MICROSOFT');
            if (ap && !bp) return -1;
            if (!ap && bp) return 1;
            return an < bn ? -1 : an > bn ? 1 : 0;
        });

        voiceSelect.innerHTML = '';
        voices.forEach((v, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${v.name} (${v.lang})${v.default ? ' — DEFAULT' : ''}`;
            opt.dataset.lang = v.lang;
            voiceSelect.appendChild(opt);
        });
    }

    populateVoiceList();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }

    // ─── Language detection (Unicode block counting) ──────────────────
    function detectLang(text) {
        const counts = {
            ar: 0, hi: 0, ta: 0, te: 0, kn: 0, ml: 0, gu: 0, pa: 0, or: 0, bn: 0,
            zh: 0, ja: 0, ko: 0, ru: 0, he: 0, th: 0, my: 0, km: 0, el: 0
        };
        const sample = text.slice(0, 2000);
        for (let i = 0; i < sample.length; i++) {
            const c = sample.charCodeAt(i);
            if (c >= 0x0600 && c <= 0x06FF) counts.ar++;
            else if (c >= 0x0900 && c <= 0x097F) counts.hi++;
            else if (c >= 0x0B80 && c <= 0x0BFF) counts.ta++;
            else if (c >= 0x0C00 && c <= 0x0C7F) counts.te++;
            else if (c >= 0x0C80 && c <= 0x0CFF) counts.kn++;
            else if (c >= 0x0D00 && c <= 0x0D7F) counts.ml++;
            else if (c >= 0x0A80 && c <= 0x0AFF) counts.gu++;
            else if (c >= 0x0A00 && c <= 0x0A7F) counts.pa++;
            else if (c >= 0x0B00 && c <= 0x0B7F) counts.or++;
            else if (c >= 0x0980 && c <= 0x09FF) counts.bn++;
            else if (c >= 0x4E00 && c <= 0x9FFF) counts.zh++;
            else if (c >= 0x3040 && c <= 0x30FF) counts.ja++;
            else if (c >= 0xAC00 && c <= 0xD7AF) counts.ko++;
            else if (c >= 0x0400 && c <= 0x04FF) counts.ru++;
            else if (c >= 0x0590 && c <= 0x05FF) counts.he++;
            else if (c >= 0x0E00 && c <= 0x0E7F) counts.th++;
            else if (c >= 0x1000 && c <= 0x109F) counts.my++;
            else if (c >= 0x1780 && c <= 0x17FF) counts.km++;
            else if (c >= 0x0370 && c <= 0x03FF) counts.el++;
        }
        // Find dominant script
        let bestLang = null, bestCount = 10;   // must beat threshold of 10
        for (const [lang, cnt] of Object.entries(counts)) {
            if (cnt > bestCount) { bestCount = cnt; bestLang = lang; }
        }
        if (bestLang) return bestLang;

        // Latin-script languages via keyword frequency
        const s = sample.toLowerCase();
        const tests = [
            ['es', /\b(el|la|los|de|que|y|en|un|una|es|con|por|para|se)\b/g],
            ['fr', /\b(le|la|les|de|du|des|est|une|un|en|et|que|qui|pas)\b/g],
            ['de', /\b(und|die|der|das|ist|ein|nicht|für|mit|von|sie|auch)\b/g],
            ['it', /\b(il|la|di|è|un|una|che|e|in|non|si|con)\b/g],
            ['pt', /\b(de|do|da|que|o|a|os|as|em|e|não|um|uma)\b/g],
            ['nl', /\b(de|het|een|van|en|in|op|te|met|niet)\b/g],
            ['pl', /\b(i|w|z|do|na|się|że|jest|jak|nie|ale)\b/g],
            ['tr', /\b(bir|bu|ve|da|de|için|ile|ne|ama|var)\b/g],
            ['id', /\b(yang|dan|di|dengan|ini|itu|untuk|dari|tidak)\b/g],
        ];
        let maxLang = 'en', maxMatches = 0;
        for (const [lang, re] of tests) {
            const n = (s.match(re) || []).length;
            if (n > maxMatches) { maxMatches = n; maxLang = lang; }
        }
        return maxLang;
    }

    // Auto-select voice for a BCP-47 primary tag (e.g. 'hi', 'ar')
    function autoSelectVoice(langTag) {
        if (!voices.length) return;
        let premiumMatch = -1, anyMatch = -1;
        for (let i = 0; i < voices.length; i++) {
            const vl = voices[i].lang.toLowerCase();
            if (!vl.startsWith(langTag.toLowerCase())) continue;
            const isPremium = voices[i].name.toLowerCase().includes('google') ||
                              voices[i].name.toLowerCase().includes('microsoft');
            if (isPremium && premiumMatch < 0) premiumMatch = i;
            if (anyMatch < 0) anyMatch = i;
        }
        const idx = premiumMatch >= 0 ? premiumMatch : anyMatch;
        if (idx >= 0) voiceSelect.selectedIndex = idx;
    }

    // ─── PDF Text Extraction (language-agnostic) ──────────────────────
    // Uses PDF.js item ordering (already logical for bidi text).
    // Groups items into visual lines via Y-coordinate, then joins them
    // adding spaces only when the inter-item gap warrants it.
    function extractPageText(items) {
        if (!items || !items.length) return '';

        // Filter truly empty items
        const valid = items.filter(it => it.str && it.str.trim() !== '');
        if (!valid.length) return '';

        // Each item: transform[4]=x, transform[5]=y, width=width, str=text
        // Compute a dynamic line threshold: median font height ÷ 2
        const heights = valid
            .map(it => Math.abs(it.transform[0]))   // scaleX ≈ font size
            .filter(h => h > 0)
            .sort((a, b) => a - b);
        const medianFontSize = heights[Math.floor(heights.length / 2)] || 10;
        const LINE_THRESH = medianFontSize * 0.5;

        // Sort: top → bottom (Y descending in PDF space), then X ascending
        const sorted = [...valid].sort((a, b) => {
            const dy = b.transform[5] - a.transform[5];
            if (Math.abs(dy) > LINE_THRESH) return dy;
            return a.transform[4] - b.transform[4];
        });

        // Group into lines
        const lines = [];
        let curLine = [], curY = null;
        for (const item of sorted) {
            const y = item.transform[5];
            if (curY === null || Math.abs(y - curY) > LINE_THRESH) {
                if (curLine.length) lines.push(curLine);
                curLine = [item];
                curY = y;
            } else {
                curLine.push(item);
            }
        }
        if (curLine.length) lines.push(curLine);

        // Build text per line — insert space only when gap > 25% of char width
        const lineStrs = lines.map(line => {
            let out = '';
            for (let i = 0; i < line.length; i++) {
                const item = line[i];
                if (i === 0) { out += item.str; continue; }
                const prev = line[i - 1];
                const prevEnd  = prev.transform[4] + (prev.width || 0);
                const curStart = item.transform[4];
                const gap = curStart - prevEnd;
                const charW = item.width > 0 ? item.width / item.str.length : 0;
                if (gap > Math.max(0.5, charW * 0.25)) out += ' ';
                out += item.str;
            }
            return out.trim();
        }).filter(l => l.length > 0);

        // Join lines — blank line separates paragraphs
        let result = '', prevBlank = false;
        for (const line of lineStrs) {
            if (!line) { prevBlank = true; continue; }
            if (result) result += prevBlank ? '\n\n' : '\n';
            result += line;
            prevBlank = false;
        }
        return result;
    }

    // ─── Drag & Drop ──────────────────────────────────────────────────
    const dropZone = document.getElementById('drop-zone');
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            fileInput.dispatchEvent(new Event('change'));
        }
    });

    // ─── File load ────────────────────────────────────────────────────
    fileInput.addEventListener('change', async e => {
        if (!e.target.files.length) return;
        const file = e.target.files[0];
        if (!file || file.type !== 'application/pdf') {
            alert('Please select a valid PDF file.');
            return;
        }
        displayArea.textContent = 'Loading PDF…';
        try {
            const buf = await file.arrayBuffer();
            pdfDocument = await pdfjsLib.getDocument({ data: buf }).promise;
            startPageInput.max = pdfDocument.numPages;
            endPageInput.max   = pdfDocument.numPages;
            startPageInput.value = 1;
            endPageInput.value   = pdfDocument.numPages;
            displayArea.textContent = `PDF Loaded (${pdfDocument.numPages} pages). Select pages and click 'Extract Text'.`;
            extractBtn.disabled = false;
            playBtn.disabled = pauseBtn.disabled = resumeBtn.disabled = cancelBtn.disabled = true;
        } catch (err) {
            console.error(err);
            displayArea.textContent = 'Error loading PDF.';
        }
    });

    // ─── Extract text ─────────────────────────────────────────────────
    extractBtn.addEventListener('click', async () => {
        if (!pdfDocument) return;

        let startPage = parseInt(startPageInput.value) || 1;
        let endPage   = parseInt(endPageInput.value)   || pdfDocument.numPages;
        startPage = Math.max(1, Math.min(startPage, pdfDocument.numPages));
        endPage   = Math.max(startPage, Math.min(endPage, pdfDocument.numPages));

        extractBtn.disabled = true;
        displayArea.textContent = 'Extracting text…';

        let fullText = '';
        try {
            for (let i = startPage; i <= endPage; i++) {
                const page    = await pdfDocument.getPage(i);
                const tc      = await page.getTextContent();   // native pdf.js call
                const pgText  = extractPageText(tc.items);
                if (pgText) fullText += pgText + '\n\n';
            }

            // Collapse 3+ newlines → 2, then trim
            fullText = fullText.replace(/\n{3,}/g, '\n\n').trim();

            if (!fullText) {
                displayArea.textContent = 'No text found in the selected pages.';
                extractBtn.disabled = false;
                return;
            }

            // ── Detect language & auto-select voice ──
            detectedLangTag = detectLang(fullText);
            // Voices might not be loaded yet on first run — retry once
            if (!voices.length) {
                await new Promise(r => setTimeout(r, 300));
                populateVoiceList();
            }
            autoSelectVoice(detectedLangTag);

            // ── Render word spans ──
            // Split on whitespace boundaries; newlines become <br>
            const tokens = fullText.split(/\n/);
            let html = '';
            let spanIdx = 0;
            wordSpans = [];

            for (let t = 0; t < tokens.length; t++) {
                const words = tokens[t].split(/\s+/).filter(w => w.length > 0);
                for (const word of words) {
                    html += `<span data-index="${spanIdx}">${word} </span>`;
                    spanIdx++;
                }
                if (t < tokens.length - 1) html += '<br>';   // paragraph/line break
            }

            displayArea.innerHTML = html;
            wordSpans = Array.from(displayArea.querySelectorAll('span'));

            playBtn.disabled = false;
            pauseBtn.disabled = resumeBtn.disabled = cancelBtn.disabled = true;
            currentWordIdx = -1;
            extractBtn.disabled = false;

        } catch (err) {
            console.error(err);
            displayArea.textContent = 'Error extracting text. Please try a different PDF.';
            extractBtn.disabled = false;
        }
    });

    // ─── Rate / Pitch sliders ─────────────────────────────────────────
    rateInput.addEventListener('input',  () => rateValue.textContent  = rateInput.value);
    pitchInput.addEventListener('input', () => pitchValue.textContent = pitchInput.value);

    // ─── Play ─────────────────────────────────────────────────────────
    playBtn.addEventListener('click', () => {
        if (!wordSpans.length) return;
        if (speechSynthesis.speaking) speechSynthesis.cancel();

        const text = wordSpans.map(s => s.textContent).join('');
        utterance  = new SpeechSynthesisUtterance(text);

        const voiceIdx = parseInt(voiceSelect.value);
        if (!isNaN(voiceIdx) && voices[voiceIdx]) {
            utterance.voice = voices[voiceIdx];
            utterance.lang  = voices[voiceIdx].lang;   // critical for correct pronunciation
        } else {
            utterance.lang = detectedLangTag;
        }
        utterance.rate   = parseFloat(rateInput.value);
        utterance.pitch  = parseFloat(pitchInput.value);
        utterance.volume = 1;
        currentWordIdx   = -1;

        // Word highlight sync
        utterance.onboundary = event => {
            if (event.name !== 'word') return;
            let charCount = 0;
            for (let i = 0; i < wordSpans.length; i++) {
                charCount += wordSpans[i].textContent.length;
                if (charCount > event.charIndex) { highlightWord(i); break; }
            }
        };

        utterance.onpause  = () => { isPaused = true;  pauseBtn.disabled = true;  resumeBtn.disabled = false; };
        utterance.onresume = () => { isPaused = false; pauseBtn.disabled = false; resumeBtn.disabled = true;  };
        utterance.onend    = () => {
            clearHighlight();
            playBtn.disabled  = false;
            pauseBtn.disabled = resumeBtn.disabled = cancelBtn.disabled = true;
        };
        utterance.onerror = e => {
            console.error('SpeechSynthesis error:', e.error);
            playBtn.disabled  = false;
            pauseBtn.disabled = resumeBtn.disabled = cancelBtn.disabled = true;
        };

        speechSynthesis.speak(utterance);
        playBtn.disabled  = true;
        pauseBtn.disabled = false;
        resumeBtn.disabled = true;
        cancelBtn.disabled = false;
        isPaused = false;
    });

    // ─── Pause ────────────────────────────────────────────────────────
    pauseBtn.addEventListener('click', () => {
        if (speechSynthesis.speaking && !isPaused) {
            speechSynthesis.pause();
            isPaused = true;
            pauseBtn.disabled = true;
            resumeBtn.disabled = false;
        }
    });

    // ─── Resume ───────────────────────────────────────────────────────
    resumeBtn.addEventListener('click', () => {
        if (isPaused) {
            speechSynthesis.resume();
            isPaused = false;
            pauseBtn.disabled  = false;
            resumeBtn.disabled = true;
        }
    });

    // ─── Cancel ───────────────────────────────────────────────────────
    cancelBtn.addEventListener('click', () => {
        if (speechSynthesis.speaking) speechSynthesis.cancel();
        clearHighlight();
        displayArea.innerHTML   = '';
        fileInput.value         = '';
        startPageInput.value    = 1;
        endPageInput.value      = 1;
        voiceSelect.selectedIndex = 0;
        playBtn.disabled = pauseBtn.disabled = resumeBtn.disabled = cancelBtn.disabled = true;
        isPaused       = false;
        wordSpans      = [];
        currentWordIdx = -1;
        detectedLangTag = 'en';
    });
});
