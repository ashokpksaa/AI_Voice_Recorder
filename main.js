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
        log("Setting up Clear Audio...");

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

        // 3. Microphone Input (Updated Constraints)
        // हमने autoGainControl को FALSE कर दिया है ताकि आवाज़ फटे नहीं
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true, 
                autoGainControl: false,  // ✅ Distortion रोकने के लिए इसे बंद किया
                channelCount: 1
            } 
        });
        const source = audioContext.createMediaStreamSource(mediaStream);

        // --- NATURAL VOCAL CHAIN ---

        // A. High-Pass Filter (हल्का सा Bass कट, ताकि आवाज़ साफ़ रहे लेकिन पतली न हो)
        const lowCut = audioContext.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 80; // पहले 120 था, अब 80 किया ताकि आवाज़ मोटी रहे

        // B. Compressor (Soft Mode - ताकि आवाज़ दबे नहीं)
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;  // Sensitivity
        compressor.knee.value = 30;        // Smooth transition
        compressor.ratio.value = 4;        // ✅ पहले 12 था (Hard), अब 4 (Soft) है
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        // C. Noise Gate (Processor)
        workletNode = new AudioWorkletNode(audioContext, 'voice-gate');

        // 4. Connection
        source.connect(lowCut);
        lowCut.connect(compressor);
        compressor.connect(workletNode);
        
        const dest = audioContext.createMediaStreamDestination();
        workletNode.connect(dest);

        // 5. Recorder
        mediaRecorder = new MediaRecorder(dest.stream);
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            audioPlayer.src = URL.createObjectURL(blob);
            chunks = [];
            log("✅ Natural Voice Saved. Play below.");
        };

        mediaRecorder.start();
        log("🔴 Recording (Clear & Natural)...");
        
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
