const startBtn = document.getElementById('btnStart');
const stopBtn = document.getElementById('btnStop');
const statusDiv = document.getElementById('status');
const timerDiv = document.getElementById('timer');
const canvas = document.getElementById('visualizer');
const audioPlayer = document.getElementById('audioPlayer');
const canvasCtx = canvas.getContext('2d');

// SLIDERS & VALUES
const slLow = document.getElementById('slLow');
const slHigh = document.getElementById('slHigh');
const slMid = document.getElementById('slMid');

const valLow = document.getElementById('valLow');
const valHigh = document.getElementById('valHigh');
const valMid = document.getElementById('valMid');

let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let source;

// NODES (इन्हें बाहर रखा है ताकि स्लाइडर इन्हें बदल सकें)
let lowCutNode;
let highCutNode;
let presenceNode; // Voice Boost
let hissFilterNode;

// Timer
let startTime;
let timerInterval;

// --- SLIDER EVENTS (Real-time Change) ---
slLow.oninput = (e) => { 
    if(lowCutNode) lowCutNode.frequency.value = e.target.value; 
    valLow.innerText = e.target.value; 
};
slHigh.oninput = (e) => { 
    // यह 'hissFilter' को कंट्रोल करेगा
    if(hissFilterNode) hissFilterNode.frequency.value = e.target.value; 
    valHigh.innerText = e.target.value; 
};
slMid.oninput = (e) => { 
    // यह 'presenceBoost' को कंट्रोल करेगा
    if(presenceNode) presenceNode.frequency.value = e.target.value; 
    valMid.innerText = e.target.value; 
};

function updateTimer() {
    const elapsed = Date.now() - startTime;
    const totalSeconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    timerDiv.innerText = `${minutes}:${seconds}`;
}

startBtn.onclick = async () => {
    try {
        statusDiv.innerText = "Recording (Adjust Sliders Now)...";
        
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        timerDiv.style.color = "#ff3d00";

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // 1. Microphone Input (Browser AI ON)
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                googEchoCancellation: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // --- FILTER CHAIN (From your favorite code) ---

        // A. High-Pass (Fan Remover) -> Controlled by Slider 1
        lowCutNode = audioContext.createBiquadFilter();
        lowCutNode.type = 'highpass';
        lowCutNode.frequency.value = slLow.value; // (Default 85Hz)

        // B. Low-Pass Filter (Hiss Remover) -> Controlled by Slider 2
        hissFilterNode = audioContext.createBiquadFilter();
        hissFilterNode.type = 'lowpass'; 
        hissFilterNode.frequency.value = slHigh.value; // (Default 8000Hz)
        hissFilterNode.Q.value = 0.7;

        // C. Parametric EQ (Voice Boost) -> Controlled by Slider 3
        presenceNode = audioContext.createBiquadFilter();
        presenceNode.type = 'peaking';
        presenceNode.frequency.value = slMid.value; // (Default 2500Hz)
        presenceNode.gain.value = 3; 
        presenceNode.Q.value = 1.0;

        // D. Soft Compressor (Fixed Settings)
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.knee.value = 20;
        compressor.ratio.value = 8;     
        compressor.attack.value = 0.005; 
        compressor.release.value = 0.15;

        // --- CONNECTIONS ---
        // Mic -> LowCut -> HissFilter -> Presence -> Compressor -> Out
        source.connect(lowCutNode);
        lowCutNode.connect(hissFilterNode);
        hissFilterNode.connect(presenceNode);
        presenceNode.connect(compressor);

        // Visualizer
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        compressor.connect(analyser);

        const dest = audioContext.createMediaStreamDestination();
        compressor.connect(dest);

        // RECORDER
        let options = { mimeType: 'audio/webm;codecs=opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) { options = { mimeType: 'audio/mp4' }; }

        mediaRecorder = new MediaRecorder(dest.stream, options);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            audioPlayer.src = url;
            audioPlayer.style.display = 'block';
            audioChunks = [];
            statusDiv.innerText = "✅ Saved! Check the sliders.";
            statusDiv.style.color = "#00e676";
            timerDiv.style.color = "#00e676";
        };

        mediaRecorder.start();
        visualize();

        // UI
        startBtn.disabled = true;
        stopBtn.disabled = false;
        stopBtn.style.opacity = "1";
        stopBtn.style.pointerEvents = "all";

    } catch (err) {
        alert("Error: " + err.message);
    }
};

stopBtn.onclick = () => {
    clearInterval(timerInterval);
    if (mediaRecorder) mediaRecorder.stop();
    if (source) source.mediaStream.getTracks().forEach(t => t.stop());
    if (audioContext) audioContext.close();
    
    startBtn.disabled = false;
    stopBtn.disabled = true;
    stopBtn.style.opacity = "0.5";
    stopBtn.style.pointerEvents = "none";
};

// Visualizer
function visualize() {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
        if(!startBtn.disabled) return;
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        canvasCtx.fillStyle = '#000';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        let x = 0;
        let barWidth = (canvas.width / bufferLength) * 2.5;
        for (let i = 0; i < bufferLength; i++) {
            let barHeight = dataArray[i] / 2;
            canvasCtx.fillStyle = `hsl(${barHeight + 120},100%,50%)`;
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
