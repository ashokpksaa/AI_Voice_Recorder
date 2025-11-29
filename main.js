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
}

startBtn.onclick = async () => {
    try {
        log("Setting up Studio Audio...");

        // 1. Audio Context
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();
        if (audioContext.state === 'suspended') await audioContext.resume();

        // 2. Load Processor
        try {
            await audioContext.audioWorklet.addModule('processor.js');
        } catch (e) {
            throw new Error("Processor Error: " + e.message);
        }

        // 3. Microphone Input
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,      // ब्राउज़र का अपना Echo Cancel
                noiseSuppression: true,      // ब्राउज़र का अपना Noise Suppression
                autoGainControl: true        // ऑटो वॉल्यूम
            } 
        });
        const source = audioContext.createMediaStreamSource(mediaStream);

        // --- STUDIO FILTERS (ये है असली जादू) ---

        // A. High-Pass Filter (पंखे और हवा की "धड़धड़" आवाज़ हटाता है)
        const lowCut = audioContext.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 120; // 120Hz से नीचे का शोर गायब

        // B. Low-Pass Filter (तीखी "Sss" और हिसिंग आवाज़ हटाता है)
        const highCut = audioContext.createBiquadFilter();
        highCut.type = 'lowpass';
        highCut.frequency.value = 8000; // बहुत बारीक शोर गायब

        // C. Compressor (आवाज़ को भारी और एक बराबर करता है)
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;
        compressor.attack.value = 0;
        compressor.release.value = 0.25;

        // D. Noise Gate (Processor.js वाला)
        workletNode = new AudioWorkletNode(audioContext, 'voice-gate');

        // 4. कनेक्शन चेन: Mic -> LowCut -> HighCut -> Compressor -> Gate -> Recorder
        source.connect(lowCut);
        lowCut.connect(highCut);
        highCut.connect(compressor);
        compressor.connect(workletNode); // गेट आखिरी में
        
        const dest = audioContext.createMediaStreamDestination();
        workletNode.connect(dest);

        // 5. Recording
        mediaRecorder = new MediaRecorder(dest.stream);
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            audioPlayer.src = URL.createObjectURL(blob);
            chunks = [];
            log("✅ Studio Audio Saved. Listen below.");
        };

        mediaRecorder.start();
        log("🔴 Recording (Filters + Compressor Active)...");
        
        startBtn.disabled = true;
        stopBtn.disabled = false;

    } catch (e) {
        log("❌ Error: " + e.message, true);
    }
};

stopBtn.onclick = () => {
    if (mediaRecorder) mediaRecorder.stop();
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    if (audioContext) audioContext.close();
    startBtn.disabled = false;
    stopBtn.disabled = true;
};
