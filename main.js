const startBtn = document.getElementById('btnStart');
const stopBtn = document.getElementById('btnStop');
const statusDiv = document.getElementById('status');
const timerDiv = document.getElementById('timer'); // Timer Element
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

// Timer Function (घड़ी चलाने के लिए)
function updateTimer() {
    const elapsed = Date.now() - startTime; // कितना समय बीता
    const totalSeconds = Math.floor(elapsed / 1000);
    
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    
    timerDiv.innerText = `${minutes}:${seconds}`;
}

startBtn.onclick = async () => {
    try {
        statusDiv.innerText = "Starting...";
        
        // --- TIMER START ---
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000); // हर 1 सेकंड में अपडेट
        timerDiv.style.color = "#ff3d00"; // रिकॉर्डिंग के समय लाल रंग

        // --- AUDIO SETUP (Same as before) ---
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true, 
                googEchoCancellation: true,
                googExperimentalEchoCancellation: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // --- FILTERS (No Changes here) ---
        // 1. Rumble Filter
        const highPass = audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 110; 

        // 2. Wood-Cut (Table Tap Remover)
        const woodCut = audioContext.createBiquadFilter();
        woodCut.type = 'peaking';
        woodCut.frequency.value = 500; 
        woodCut.Q.value = 2;
        woodCut.gain.value = -8;

        // 3. High Freq Polish
        const lowPass = audioContext.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 8000;

        // 4. Fast Compressor (Transient Killer)
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.001; 
        compressor.release.value = 0.20; 

        // Connections
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
            statusDiv.innerText = "✅ Saved!";
            statusDiv.style.color = "#00e676";
            
            // Timer का रंग वापस हरा कर दें
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
        clearInterval(timerInterval); // Error आये तो टाइमर रोक दो
        statusDiv.innerText = "Error: " + err.message;
        statusDiv.style.color = "red";
    }
};

stopBtn.onclick = () => {
    // --- TIMER STOP ---
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
            canvasCtx.fillStyle = `hsl(270, 100%, ${Math.min(barHeight + 20, 70)}%)`;
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
