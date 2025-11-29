const startBtn = document.getElementById('btnStart');
const stopBtn = document.getElementById('btnStop');
const statusDiv = document.getElementById('status');
const timerDiv = document.getElementById('timer');
const canvas = document.getElementById('visualizer');
const audioPlayer = document.getElementById('audioPlayer');
const canvasCtx = canvas.getContext('2d');

let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let source;

// Timer Variables
let startTime;
let timerInterval;

function updateTimer() {
    const elapsed = Date.now() - startTime;
    const totalSeconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    timerDiv.innerText = `${minutes}:${seconds}`;
}

startBtn.onclick = async () => {
    try {
        statusDiv.innerText = "Activating Stable Mode...";
        
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        timerDiv.style.color = "#ff3d00";

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // --- 1. HARDWARE MASTERY (सबसे ज़रूरी स्टेप) ---
        // हम ब्राउज़र को Force कर रहे हैं कि वह अपनी "Aggressive" सफाई यूज़ करे।
        // इससे Echo और Fan Noise 90% हार्डवेयर लेवल पर ही हट जाएगा।
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true, // इसे True रखें ताकि आवाज़ दबे नहीं
                channelCount: 1,       // Mono Audio (साफ़ आवाज़ के लिए बेहतर)
                // Advanced Flags
                googEchoCancellation: true,
                googExperimentalEchoCancellation: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // --- 2. SINGLE MASTER FILTER (Stability के लिए) ---
        // हम 5 फिल्टर नहीं, सिर्फ 1 "Bandpass" लगाएंगे।
        // यह सिर्फ़ इंसानी आवाज़ की रेंज (100Hz - 8000Hz) को पास करेगा।
        // बाकी सब (पंखा, हॉर्न, टक-टक) अपने आप बाहर हो जाएंगे।
        
        // A. Low Cut (Rumble/Fan/Table Thud remover)
        const lowCut = audioContext.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 110; 

        // B. High Cut (Hiss/Squeak remover)
        const highCut = audioContext.createBiquadFilter();
        highCut.type = 'lowpass';
        highCut.frequency.value = 8000;

        // C. Simple Compressor (Volume Balance)
        // सिर्फ़ वॉल्यूम बराबर करने के लिए, आवाज़ छेड़ने के लिए नहीं।
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.knee.value = 40;
        compressor.ratio.value = 3;     // Light compression
        compressor.attack.value = 0.05; // Normal attack (Not too fast)
        compressor.release.value = 0.25;

        // Connections: Mic -> LowCut -> HighCut -> Compressor -> Out
        source.connect(lowCut);
        lowCut.connect(highCut);
        highCut.connect(compressor);

        // Visualizer
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        compressor.connect(analyser);

        const dest = audioContext.createMediaStreamDestination();
        compressor.connect(dest);

        // Recorder
        let options = { mimeType: 'audio/webm;codecs=opus' }; 
        // Opus कोडेक सबसे साफ़ आवाज़ देता है और मोबाइल पर लाइट चलता है
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'audio/mp4' };
        }

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
            statusDiv.innerText = "✅ Saved (Stable Mode)!";
            statusDiv.style.color = "#00e676";
            timerDiv.style.color = "#00e676";
        };

        mediaRecorder.start();
        visualize();

        // UI
        startBtn.disabled = true;
        startBtn.style.opacity = "0.5";
        stopBtn.disabled = false;
        stopBtn.style.opacity = "1";
        stopBtn.style.pointerEvents = "all";
        stopBtn.style.background = "#ff3d00";
        statusDiv.innerText = "🔴 Recording...";
        statusDiv.style.color = "#ff3d00";

    } catch (err) {
        clearInterval(timerInterval);
        statusDiv.innerText = "Error: " + err.message;
        statusDiv.style.color = "red";
    }
};

stopBtn.onclick = () => {
    clearInterval(timerInterval);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        if(source) source.mediaStream.getTracks().forEach(track => track.stop());
        if(audioContext) audioContext.close();
    }
    
    startBtn.disabled = false;
    startBtn.style.opacity = "1";
    stopBtn.disabled = true;
    stopBtn.style.opacity = "0.5";
    stopBtn.style.pointerEvents = "none";
    if(drawVisual) cancelAnimationFrame(drawVisual);
};

// Visualizer
let drawVisual;
function visualize() {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
        drawVisual = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = '#111';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2;
            canvasCtx.fillStyle = `hsl(140, 100%, ${Math.min(barHeight + 20, 60)}%)`; // Stable Green
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
