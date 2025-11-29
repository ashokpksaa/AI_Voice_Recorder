const startBtn = document.getElementById('btnStart');
const stopBtn = document.getElementById('btnStop');
const statusSpan = document.getElementById('status');
const audioPlayer = document.getElementById('audioPlayer');

let audioContext;
let mediaStream;
let workletNode;
let mediaRecorder;
let chunks = [];

// Error दिखने के लिए हेल्पर फंक्शन
function log(msg, isError = false) {
    console.log(msg);
    statusSpan.innerText = msg;
    if (isError) statusSpan.style.color = "red";
    else statusSpan.style.color = "#00f2c3"; // Greenish
}

startBtn.onclick = async () => {
    try {
        log("Starting Setup...");
        
        // 1. AudioContext बनाएँ
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();

        // Mobile Fix: Resume Context (बहुत ज़रूरी)
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        log("Loading AI Module...");
        try {
            await audioContext.audioWorklet.addModule('processor.js');
        } catch (e) {
            throw new Error("processor.js लोड नहीं हुआ: " + e.message);
        }

        // 2. Microphone मांगें
        log("Requesting Mic...");
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const source = audioContext.createMediaStreamSource(mediaStream);

        // 3. Worklet Node बनाएँ
        workletNode = new AudioWorkletNode(audioContext, 'rnnoise-processor');
        
        // Processor से मैसेज सुनें (Debugging के लिए)
        workletNode.port.onmessage = (event) => {
            if (event.data.type === 'status') log("✅ AI Active & Running!");
            if (event.data.type === 'error') log("⚠️ AI Error: " + event.data.message, true);
        };

        // 4. WASM लोड करें
        log("Fetching WASM...");
        const response = await fetch('rnnoise.wasm');
        if (!response.ok) throw new Error(`WASM फाइल नहीं मिली! (${response.status})`);
        
        const wasmBytes = await response.arrayBuffer();
        workletNode.port.postMessage({ type: 'load-wasm', wasmBytes });

        // 5. कनेक्ट करें
        const dest = audioContext.createMediaStreamDestination();
        source.connect(workletNode);
        workletNode.connect(dest);

        // 6. रिकॉर्डर
        mediaRecorder = new MediaRecorder(dest.stream);
        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            audioPlayer.src = URL.createObjectURL(blob);
            chunks = [];
            log("Recording Saved. Play 👇");
        };

        mediaRecorder.start();
        log("🔴 Recording... (Speak Now!)");
        
        startBtn.disabled = true;
        stopBtn.disabled = false;

    } catch (e) {
        log("❌ Error: " + e.message, true);
    }
};

stopBtn.onclick = () => {
    if (mediaRecorder) mediaRecorder.stop();
    if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
    if (audioContext) audioContext.close();
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
};
