const startBtn = document.getElementById('btnStart');
const stopBtn = document.getElementById('btnStop');
const statusSpan = document.getElementById('status');
const audioPlayer = document.getElementById('audioPlayer');

let audioContext;
let mediaStream;
let workletNode;
let mediaRecorder;
let chunks = [];

function log(msg, isError = false) {
    statusSpan.innerText = msg;
    statusSpan.style.color = isError ? "#ff4444" : "#00f2c3";
    console.log(msg);
}

startBtn.onclick = async () => {
    try {
        log("Initializing...");

        // 1. Audio Context
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();
        if (audioContext.state === 'suspended') await audioContext.resume();

        // 2. Load Processor
        try {
            await audioContext.audioWorklet.addModule('processor.js');
        } catch (e) {
            throw new Error("Processor load failed: " + e.message);
        }

        // 3. Microphone Access
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContext.createMediaStreamSource(mediaStream);

        // 4. Connect Node (No WASM needed now)
        workletNode = new AudioWorkletNode(audioContext, 'rnnoise-processor');

        // 5. Connect Graph
        const dest = audioContext.createMediaStreamDestination();
        source.connect(workletNode);
        workletNode.connect(dest);

        // 6. Start Recording
        mediaRecorder = new MediaRecorder(dest.stream);
        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) chunks.push(e.data);
        };
        
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            audioPlayer.src = url;
            chunks = [];
            log("✅ Saved! Play below to listen.");
        };

        mediaRecorder.start();
        log("🔴 Recording... (Noise Gate Active)");
        
        startBtn.disabled = true;
        stopBtn.disabled = false;

    } catch (e) {
        log("❌ Error: " + e.message, true);
    }
};

stopBtn.onclick = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
    if (audioContext) audioContext.close();
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
};
