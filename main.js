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
let scriptNode;

// --- STRICT SETTINGS ---
const SILENCE_THRESHOLD = 0.04; // 4% से धीमी आवाज़ को 0 कर देगा

// Timer
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
        statusDiv.innerText = "Activating Vocal Isolation...";
        
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        timerDiv.style.color = "#ff3d00";

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // 1. MIC INPUT (Strict Mode)
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false, // ❌ OFF: शोर को बढ़ने से रोकेगा
                googEchoCancellation: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // --- THE "CUT EVERYTHING" CHAIN ---

        // A. SUPER HIGH PASS (Fan/Bike Killer)
        // हमने इसे 200Hz कर दिया है। 
        // इससे आवाज़ थोड़ी भारी कम होगी, लेकिन पंखे की "हवा" पूरी तरह गायब हो जाएगी।
        const lowCut = audioContext.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 200; 

        // B. SUPER LOW PASS (Horn/Hiss Killer)
        // इसे 3000Hz पर लॉक कर दिया है।
        // हॉर्न (3500Hz+) और सर-सर (4000Hz+) का अंदर आना नामुमकिन है।
        const highCut = audioContext.createBiquadFilter();
        highCut.type = 'lowpass';
        highCut.frequency.value = 3000; 

        // C. COMPRESSOR (Leveler)
        // आवाज़ को एक बराबर रखने के लिए
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.ratio.value = 6; 
        compressor.attack.value = 0.005;
        compressor.release.value = 0.15;

        // D. HARD NOISE GATE (Sannata Maker)
        scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
        scriptNode.onaudioprocess = function(ev) {
            const input = ev.inputBuffer.getChannelData(0);
            const output = ev.outputBuffer.getChannelData(0);
            
            for (let i = 0; i < input.length; i++) {
                // अगर आवाज़ 4% से कम है (शोर), तो उसे MUTE कर दो
                if (Math.abs(input[i]) < SILENCE_THRESHOLD) {
                    output[i] = 0;
                } else {
                    output[i] = input[i];
                }
            }
        };

        // CONNECTIONS
        // Mic -> LowCut -> HighCut -> Compressor -> Gate -> Out
        source.connect(lowCut);
        lowCut.connect(highCut);
        highCut.connect(compressor);
        compressor.connect(scriptNode);
        
        // Visualizer
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
            statusDiv.innerText = "✅ Saved (Strict Mode)!";
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
        statusDiv.innerText = "🔴 Recording (Strict Noise Cut)...";
        statusDiv.style.color = "#ff3d00";

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

// Visualizer (Simple)
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
            // Red bars for "Recording"
            canvasCtx.fillStyle = `hsl(10, 100%, 50%)`;
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
