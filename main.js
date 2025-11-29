const startBtn = document.getElementById('btnStart');
const stopBtn = document.getElementById('btnStop');
const statusSpan = document.getElementById('status');
const audioPlayer = document.getElementById('audioPlayer');

let audioContext;
let mediaStream;
let workletNode;
let mediaRecorder;
let chunks = [];

startBtn.onclick = async () => {
    try {
        statusSpan.innerText = "Loading AI Module...";
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // 1. Processor (AI) Code लोड करें
        await audioContext.audioWorklet.addModule('processor.js');

        // 2. Microphone एक्सेस करें
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContext.createMediaStreamSource(mediaStream);

        // 3. Worklet Node बनाएं (यह processor.js से बात करेगा)
        workletNode = new AudioWorkletNode(audioContext, 'rnnoise-processor');
        
        // 4. WASM फाइल लोड करने का कमांड भेजें
        const response = await fetch('rnnoise.wasm');
        const wasmBytes = await response.arrayBuffer();
        
        // Worklet को मैसेज भेजें कि WASM तैयार है
        workletNode.port.postMessage({ type: 'load-wasm', wasmBytes });

        // 5. ऑडियो ग्राफ कनेक्ट करें (Mic -> AI -> Recorder)
        const dest = audioContext.createMediaStreamDestination();
        
        source.connect(workletNode);
        workletNode.connect(dest);

        // 6. रिकॉर्डिंग शुरू करें
        mediaRecorder = new MediaRecorder(dest.stream);
        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            audioPlayer.src = URL.createObjectURL(blob);
            chunks = [];
            statusSpan.innerText = "Processing Complete. Play to listen.";
        };

        mediaRecorder.start();
        statusSpan.innerText = "🔴 Recording (AI Noise Removal Active)...";
        startBtn.disabled = true;
        stopBtn.disabled = false;

    } catch (e) {
        console.error(e);
        statusSpan.innerText = "Error: " + e.message;
    }
};

stopBtn.onclick = () => {
    mediaRecorder.stop();
    mediaStream.getTracks().forEach(track => track.stop());
    audioContext.close();
    startBtn.disabled = false;
    stopBtn.disabled = true;
};