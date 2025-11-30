const startBtn = document.getElementById('btnStart');
const stopBtn = document.getElementById('btnStop');
const statusDiv = document.getElementById('status');
const timerDiv = document.getElementById('timer');
const canvas = document.getElementById('visualizer');
const audioPlayer = document.getElementById('audioPlayer');
const chkMonitor = document.getElementById('chkMonitor');
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

// NODES (Global for Live Tuning)
var lowCutNode = null;
var highCutNode = null;
var presenceNode = null;
var dest = null; // Destination Node

let startTime;
let timerInterval;

// --- INSTANT SLIDER UPDATE ---
slLow.oninput = function() {
    valLow.innerText = this.value;
    if(lowCutNode) lowCutNode.frequency.value = this.value;
};
slHigh.oninput = function() {
    valHigh.innerText = this.value;
    if(highCutNode) highCutNode.frequency.value = this.value;
};
slMid.oninput = function() {
    valMid.innerText = this.value;
    if(presenceNode) presenceNode.frequency.value = this.value;
};

// --- MONITOR SWITCH ---
chkMonitor.onchange = function() {
    if(!audioContext) return;
    if(this.checked) {
        // Connect to Speakers (Headphones)
        dest.connect(audioContext.destination);
    } else {
        // Disconnect from Speakers
        try { dest.disconnect(audioContext.destination); } catch(e){}
    }
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
        statusDiv.innerText = "🔴 LIVE TUNING MODE";
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
                autoGainControl: false, // OFF for pure testing
                googEchoCancellation: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // --- FILTERS ---
        
        // 1. Fan Cut (High Pass)
        lowCutNode = audioContext.createBiquadFilter();
        lowCutNode.type = 'highpass';
        lowCutNode.frequency.value = slLow.value;

        // 2. Hiss Cut (Low Pass)
        highCutNode = audioContext.createBiquadFilter();
        highCutNode.type = 'lowpass';
        highCutNode.frequency.value = slHigh.value;

        // 3. Voice Sharpness (Peaking)
        presenceNode = audioContext.createBiquadFilter();
        presenceNode.type = 'peaking';
        presenceNode.frequency.value = slMid.value;
        presenceNode.gain.value = 5; 
        presenceNode.Q.value = 1.0;

        // 4. Compressor
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

        // Destination Setup
        dest = audioContext.createMediaStreamDestination();
        compressor.connect(dest);

        // Visualizer
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        compressor.connect(analyser);

        // --- MONITOR LOGIC ---
        if(chkMonitor.checked) {
            dest.connect(audioContext.destination); // Hear Live
        }

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
    
    // Disconnect Monitor to stop feedback
    if(dest) {
        try { dest.disconnect(audioContext.destination); } catch(e){}
    }
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
            canvasCtx.fillStyle = `hsl(${barHeight + 100},100%,50%)`;
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
