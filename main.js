const startBtn = document.getElementById('btnStart');
const stopBtn = document.getElementById('btnStop');
const statusDiv = document.getElementById('status');
const timerDiv = document.getElementById('timer');
const canvas = document.getElementById('visualizer');
const audioPlayer = document.getElementById('audioPlayer');
const canvasCtx = canvas.getContext('2d');

// SLIDERS
const slLow = document.getElementById('slLow');   // Fan
const slHigh = document.getElementById('slHigh'); // Horn/Hiss
const slGate = document.getElementById('slGate'); // Silence
const slVol = document.getElementById('slVol');   // Volume

// VALUE LABELS
const valLow = document.getElementById('valLow');
const valHigh = document.getElementById('valHigh');
const valGate = document.getElementById('valGate');
const valVol = document.getElementById('valVol');

let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let source;

// NODES (इन्हें ग्लोबल रखा है ताकि स्लाइडर इन्हें बदल सकें)
let lowCutNode;
let highCutNode;
let gainNode;
let scriptNode;
let noiseThreshold = 0.04; // Default

// Timer
let startTime;
let timerInterval;

// --- SLIDER EVENTS (Real-time updates) ---
slLow.oninput = (e) => { 
    if(lowCutNode) lowCutNode.frequency.value = e.target.value; 
    valLow.innerText = e.target.value; 
};
slHigh.oninput = (e) => { 
    if(highCutNode) highCutNode.frequency.value = e.target.value; 
    valHigh.innerText = e.target.value; 
};
slVol.oninput = (e) => { 
    if(gainNode) gainNode.gain.value = e.target.value; 
    valVol.innerText = e.target.value; 
};
slGate.oninput = (e) => { 
    noiseThreshold = parseFloat(e.target.value); 
    valGate.innerText = noiseThreshold; 
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
        statusDiv.innerText = "Live Testing Mode...";
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // Mic Setup
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false, // OFF for manual control
                googEchoCancellation: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // --- FILTERS SETUP ---
        
        // 1. Volume Booster
        gainNode = audioContext.createGain();
        gainNode.gain.value = slVol.value;

        // 2. Low Cut (Fan)
        lowCutNode = audioContext.createBiquadFilter();
        lowCutNode.type = 'highpass';
        lowCutNode.frequency.value = slLow.value;

        // 3. High Cut (Horn/Hiss)
        highCutNode = audioContext.createBiquadFilter();
        highCutNode.type = 'lowpass';
        highCutNode.frequency.value = slHigh.value;

        // 4. Noise Gate (Manual)
        scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
        noiseThreshold = parseFloat(slGate.value);

        scriptNode.onaudioprocess = function(ev) {
            const input = ev.inputBuffer.getChannelData(0);
            const output = ev.outputBuffer.getChannelData(0);
            for (let i = 0; i < input.length; i++) {
                // स्लाइडर की वैल्यू से चेक करो
                if (Math.abs(input[i]) < noiseThreshold) {
                    output[i] = 0; // Mute
                } else {
                    output[i] = input[i];
                }
            }
        };

        // CONNECTIONS
        source.connect(gainNode);
        gainNode.connect(lowCutNode);
        lowCutNode.connect(highCutNode);
        highCutNode.connect(scriptNode);
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        scriptNode.connect(analyser);

        const dest = audioContext.createMediaStreamDestination();
        scriptNode.connect(dest);

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
            statusDiv.innerText = "✅ Test Saved!";
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
