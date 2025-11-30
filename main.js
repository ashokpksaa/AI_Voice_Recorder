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
        statusDiv.innerText = "Activating Pro Studio Mode...";
        
        // Timer Start
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        timerDiv.style.color = "#ff3d00";

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // 1. MIC SETTINGS (Stability Fix)
        // 'autoGainControl: false' -> यह सबसे ज़रूरी है।
        // अब मोबाइल अपनी मर्जी से वॉल्यूम ऊपर-नीचे नहीं करेगा।
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false, // ❌ OFF (ताकि आवाज़ Consistent रहे)
                channelCount: 1,
                googEchoCancellation: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // 2. VOLUME STABILIZER (Manual Gain)
        // चूंकि हमने Auto Volume बंद किया है, हमें मैन्युअल वॉल्यूम देना होगा।
        // 3.5x परफेक्ट बैलेंस है।
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 3.5;

        // --- THE "90% GOOD" FILTERS (Restored) ---

        // A. Rumble Cutter (100Hz) - पंखा/भारी शोर हटाने के लिए
        const lowCut = audioContext.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 100; 

        // B. Echo Remover (350Hz) - कमरे की गूंज हटाने के लिए
        const echoCut = audioContext.createBiquadFilter();
        echoCut.type = 'peaking';
        echoCut.frequency.value = 350;
        echoCut.Q.value = 1.5;
        echoCut.gain.value = -10; 

        // C. Table Tap Killer (500Hz) - 'टक-टक' हटाने के लिए
        const woodCut = audioContext.createBiquadFilter();
        woodCut.type = 'peaking';
        woodCut.frequency.value = 500; 
        woodCut.Q.value = 2.0;
        woodCut.gain.value = -10; // -10dB Cut

        // D. Hiss/Horn Shield (7000Hz) - सर-सर हटाने के लिए
        // (पिछली बार 3000Hz पर आवाज़ खराब हुई थी, 7000Hz सेफ है)
        const highCut = audioContext.createBiquadFilter();
        highCut.type = 'lowpass';
        highCut.frequency.value = 7000;

        // E. Compressor (Leveler) - आवाज़ फटने से बचाएगा
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 6; 
        compressor.attack.value = 0.003; 
        compressor.release.value = 0.25;

        // --- CONNECTIONS ---
        // Mic -> Gain -> LowCut -> EchoCut -> WoodCut -> HighCut -> Compressor -> Out
        source.connect(gainNode);
        gainNode.connect(lowCut);
        lowCut.connect(echoCut);
        echoCut.connect(woodCut);
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
            statusDiv.innerText = "✅ Saved (Stable Pro)!";
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
        statusDiv.innerText = "Error: " + err.message;
        statusDiv.style.color = "red";
    }
};

stopBtn.onclick = () => {
    clearInterval(timerInterval);
    if (mediaRecorder) mediaRecorder.stop();
    if (source) source.mediaStream.getTracks().forEach(t => t.stop());
    if (audioContext) audioContext.close();
    
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
        if(!startBtn.disabled) return;
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        canvasCtx.fillStyle = '#111';
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
