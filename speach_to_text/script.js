const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const textArea = document.getElementById("text");
const saveBtn = document.getElementById("save");
const delbtn = document.getElementById("delete");
const notesList = document.getElementById("notesList");
let recognition;
if ('webkitSpeechRecognition' in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-IN';

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      transcript += event.results[i][0].transcript;
    }
    textArea.value = transcript;
  };
} else {
  alert("Speech Recognition not supported in this browser.");
}

startBtn.onclick = () => {
  recognition.start();
};

stopBtn.onclick = () => {
  recognition.stop();
};

saveBtn.onclick = () => {
  const note = textArea.value.trim();
  if (note) {
    let notes = JSON.parse(localStorage.getItem("notes") || "[]");
    notes.push(note);
    localStorage.setItem("notes", JSON.stringify(notes));
    displayNotes();
    textArea.value = "";
  }
};
delbtn.onclick = () => {
  // Clear all notes from local storage
  localStorage.removeItem("notes");
  displayNotes();
}

const { jsPDF } = window.jspdf;

const downloadBtn = document.getElementById("Download");
downloadBtn.onclick = () => {
  const doc = new jsPDF();

  // Add textarea content
  const textContent = textArea.value.trim();
  let y = 10;
  if (textContent) {
    doc.text("Textarea Content:", 10, y);
    y += 10;
    const splitText = doc.splitTextToSize(textContent, 180);
    doc.text(splitText, 10, y);
    y += splitText.length * 10;
  }

  // Add saved notes
  const notes = JSON.parse(localStorage.getItem("notes") || "[]");
  if (notes.length > 0) {
    doc.text("Saved Notes:", 10, y);
    y += 10;
    notes.forEach((note, index) => {
      const splitNote = doc.splitTextToSize(`${index + 1}. ${note}`, 180);
      doc.text(splitNote, 10, y);
      y += splitNote.length * 10;
    });
  }

  doc.save("notes.pdf");
};

function displayNotes() {
  let notes = JSON.parse(localStorage.getItem("notes") || "[]");
  notesList.innerHTML = "";
  notes.forEach((note, index) => {
    const li = document.createElement("li");
    li.textContent = note;
    notesList.appendChild(li);
  });
}

displayNotes();
