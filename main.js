const startBtn = document.getElementById('btnStart');
const stopBtn = document.getElementById('btnStop');
const statusDiv = document.getElementById('status');
const canvas = document.getElementById('visualizer');
const audioPlayer = document.getElementById('audioPlayer');
const canvasCtx = canvas.getContext('2d');

let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let source;

startBtn.onclick = async () => {
    try {
        statusDiv.innerText = "Activating Transient Killer...";
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // 1. Microphone Input (Hardware AI Forced ON)
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true, 
                // Advanced Android Flags
                googEchoCancellation: true,
                googExperimentalEchoCancellation: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // --- SURGICAL AUDIO CHAIN ---

        // A. High-Pass Filter (Low Thud Killer)
        // टेबल की "धमक" (Thud) को काटने के लिए हमने इसे 100Hz से बढ़ाकर 110Hz कर दिया है।
        const highPass = audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 110; 

        // B. "Wood-Cut" Filter (Table Resonance Remover)
        // टेबल की "टक-टक" अक्सर 500Hz के आसपास गूंजती है।
        // हम वहां एक गड्ढा (Dip) बना रहे हैं।
        const woodCut = audioContext.createBiquadFilter();
        woodCut.type = 'peaking';
        woodCut.frequency.value = 500; 
        woodCut.Q.value = 2;          // Sharpness
        woodCut.gain.value = -8;      // 8dB की कमी (टक-टक दबेगी)

        // C. High-Frequency Polish
        // 8000Hz से ऊपर का हिस हटाएंगे
        const lowPass = audioContext.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 8000;

        // D. Fast-Attack Compressor (Transient Shaper)
        // यह सबसे ज़रूरी है "टक" को रोकने के लिए।
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 5;      // थोड़ा सख्त किया
        compressor.attack.value = 0.001; // ✅ Super Fast Attack (ताकि "टक" आते ही दब जाए)
        compressor.release.value = 0.20; 

        // --- CONNECTIONS ---
        // Mic -> HighPass -> WoodCut -> LowPass -> Compressor -> Out
        source.connect(highPass);
        highPass.connect(woodCut);
        woodCut.connect(lowPass);
        lowPass.connect(compressor);

        // Visualizer
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        compressor.connect(analyser);

        const dest = audioContext.createMediaStreamDestination();
        compressor.connect(dest);

        // --- RECORDER ---
        let options = { mimeType: 'audio/webm;codecs=opus' };
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
            statusDiv.innerText = "✅ Noise & Taps Removed!";
            statusDiv.style.color = "#00e676";
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
        statusDiv.innerText = "🔴 Recording (Anti-Tap Mode)...";
        statusDiv.style.color = "#ff3d00";

    } catch (err) {
        statusDiv.innerText = "Error: " + err.message;
        statusDiv.style.color = "red";
    }
};

stopBtn.onclick = () => {
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

// --- VISUALIZER ---
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
            // पर्पल कलर (Professional Look)
            canvasCtx.fillStyle = `hsl(270, 100%, ${Math.min(barHeight + 20, 70)}%)`;
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
