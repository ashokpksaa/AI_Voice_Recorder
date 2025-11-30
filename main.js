const startBtn = document.getElementById('btnStart');
const stopBtn = document.getElementById('btnStop');
const statusDiv = document.getElementById('status');
const timerDiv = document.getElementById('timer');
const canvas = document.getElementById('visualizer');
const audioPlayer = document.getElementById('audioPlayer');
const canvasCtx = canvas.getContext('2d');

// SLIDERS
const slLow = document.getElementById('slLow');
const slHigh = document.getElementById('slHigh');
const slMid = document.getElementById('slMid');

// LABELS
const valLow = document.getElementById('valLow');
const valHigh = document.getElementById('valHigh');
const valMid = document.getElementById('valMid');

let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let source;

// NODES (Global Variables)
// हम इन्हें 'var' बना रहे हैं ताकि ये कभी भी access हो सकें
var lowCutNode = null;
var highCutNode = null;
var presenceNode = null; 

let startTime;
let timerInterval;

// --- SLIDER LOGIC (Ye ab 100% kaam karega) ---

// 1. Fan Cut Slider
slLow.addEventListener('input', function() {
    let val = parseFloat(this.value); // Number mein convert kiya
    valLow.innerText = val;
    if (lowCutNode) {
        lowCutNode.frequency.setValueAtTime(val, audioContext.currentTime);
    }
});

// 2. Hiss Cut Slider
slHigh.addEventListener('input', function() {
    let val = parseFloat(this.value);
    valHigh.innerText = val;
    if (highCutNode) {
        highCutNode.frequency.setValueAtTime(val, audioContext.currentTime);
    }
});

// 3. Voice Boost Slider
slMid.addEventListener('input', function() {
    let val = parseFloat(this.value);
    valMid.innerText = val;
    if (presenceNode) {
        presenceNode.frequency.setValueAtTime(val, audioContext.currentTime);
    }
});

function updateTimer() {
    const elapsed = Date.now() - startTime;
    const totalSeconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    timerDiv.innerText = `${minutes}:${seconds}`;
}

startBtn.onclick = async () => {
    try {
        statusDiv.innerText = "🔴 Live Tuning Active...";
        
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        timerDiv.style.color = "#ff3d00";

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // Mic Input
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

        // --- CREATING FILTERS ---

        // A. Fan Cut (High Pass)
        lowCutNode = audioContext.createBiquadFilter();
        lowCutNode.type = 'highpass';
        lowCutNode.frequency.value = parseFloat(slLow.value);

        // B. Hiss Cut (Low Pass)
        highCutNode = audioContext.createBiquadFilter();
        highCutNode.type = 'lowpass';
        highCutNode.frequency.value = parseFloat(slHigh.value);

        // C. Voice Boost (Peaking)
        presenceNode = audioContext.createBiquadFilter();
        presenceNode.type = 'peaking';
        presenceNode.frequency.value = parseFloat(slMid.value);
        presenceNode.gain.value = 5; // Strong Boost (Taki slide karne par fark dikhe)
        presenceNode.Q.value = 1.0;

        // D. Compressor (Fixed)
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.15;

        // --- CONNECTIONS ---
        source.connect(lowCutNode);
        lowCutNode.connect(highCutNode);
        highCutNode.connect(presenceNode);
        presenceNode.connect(compressor);

        // Visualizer & Recorder Destination
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        compressor.connect(analyser);

        const dest = audioContext.createMediaStreamDestination();
        compressor.connect(dest);

        // Recorder
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
            statusDiv.innerText = "✅ Saved!";
            statusDiv.style.color = "#00e676";
            timerDiv.style.color = "#00e676";
        };

        mediaRecorder.start();
        visualize();

        // UI Updates
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
