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
        statusDiv.innerText = "Activating Aggressive Noise Killer...";
        
        // Timer Start
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        timerDiv.style.color = "#ff3d00";

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // 1. HARDWARE SETTINGS (Best Possible)
        // हमने 'autoGainControl' वापस ON कर दिया है क्योंकि 'Aggressive Filter' के साथ 
        // यह शोर को बेहतर तरीके से दबाता है।
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

        // --- THE AGGRESSIVE CLEANING CHAIN ---

        // A. SUPER LOW CUT (Fan & Bike Engine Killer)
        // पंखे और बाइक की भारी आवाज़ 150Hz से नीचे होती है।
        // हमने इसे 130Hz पर सेट किया है (थोड़ी आवाज़ पतली होगी, लेकिन शोर मर जाएगा)।
        const lowCut = audioContext.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 130; 

        // B. FAN REDUCER (Low Shelf) - **NEW**
        // यह एक नया फिल्टर है जो "हवा" की आवाज़ (250Hz के नीचे) को 10dB और दबा देगा।
        const fanReducer = audioContext.createBiquadFilter();
        fanReducer.type = 'lowshelf';
        fanReducer.frequency.value = 250;
        fanReducer.gain.value = -10; 

        // C. TAP KILLER PRO (500Hz) - **UPGRADED**
        // टेबल की टक-टक के लिए हमने पावर बढ़ा दी है (-8dB से -15dB)।
        // Q Value को 3 कर दिया है ताकि यह सिर्फ "टक" को काटे, आपकी आवाज़ को नहीं।
        const woodCut = audioContext.createBiquadFilter();
        woodCut.type = 'peaking';
        woodCut.frequency.value = 500; 
        woodCut.Q.value = 3.0;        // Sharp Cut
        woodCut.gain.value = -15;     // Deep Silence for Taps

        // D. HORN/TRAFFIC CUTTER (6000Hz)
        // बाइक के हॉर्न और तीखी आवाज़ों के लिए हमने रेंज 8000 से घटाकर 6000 कर दी है।
        const highCut = audioContext.createBiquadFilter();
        highCut.type = 'lowpass';
        highCut.frequency.value = 6000;

        // E. COMPRESSOR (Tight Control)
        // शोर को ऊपर उठने से रोकने के लिए Ratio बढ़ा दिया है।
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -22;
        compressor.knee.value = 20;
        compressor.ratio.value = 8;      // Stronger compression
        compressor.attack.value = 0.002; 
        compressor.release.value = 0.20; 

        // --- CONNECTIONS ---
        // Mic -> LowCut -> FanReducer -> WoodCut -> HighCut -> Compressor -> Out
        source.connect(lowCut);
        lowCut.connect(fanReducer);
        fanReducer.connect(woodCut);
        woodCut.connect(highCut);
        highCut.connect(compressor);

        // Visualizer
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        compressor.connect(analyser);

        const dest = audioContext.createMediaStreamDestination();
        compressor.connect(dest);

        // Recorder
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
            statusDiv.innerText = "✅ Saved (Super Clean)!";
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
        statusDiv.innerText = "🔴 Recording (Aggressive Mode)...";
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
            // Red/Orange bars specifically for "Aggressive Mode" feel
            canvasCtx.fillStyle = `hsl(${barHeight}, 100%, 50%)`;
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
