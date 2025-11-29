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

// सेटिंग्स (छेड़ें नहीं)
const NOISE_THRESHOLD = 0.04; // गेट की लिमिट
const VOLUME_BOOST = 4.0;     // आवाज़ 4 गुना तेज

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
        statusDiv.innerText = "Activating Horn Shield...";
        
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        timerDiv.style.color = "#ff3d00";

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // 1. MIC INPUT (Auto Gain OFF)
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false, // ❌ OFF: ताकि हॉर्न का वॉल्यूम खुद न बढ़े
                googEchoCancellation: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // 2. BOOSTER
        const gainNode = audioContext.createGain();
        gainNode.gain.value = VOLUME_BOOST;

        // --- 3. THE HORN KILLER FILTERS (Telephone Band) ---
        
        // A. Rumble Remover (Fan/Engine)
        // 150Hz से नीचे का सब कुछ गायब
        const lowCut = audioContext.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 150; 

        // B. HORN KILLER (High Cut) - **MAIN FIX**
        // हॉर्न की तीखी आवाज़ 3500Hz के ऊपर होती है।
        // हम 3200Hz पर दीवार लगा रहे हैं। इसके ऊपर की कोई भी तीखी आवाज़ अंदर नहीं आएगी।
        const highCut = audioContext.createBiquadFilter();
        highCut.type = 'lowpass';
        highCut.frequency.value = 3200; // Strict Cut

        // 4. COMPRESSOR (Limiter)
        // यह सुनिश्चित करेगा कि अगर हॉर्न बजे भी, तो वह आपकी आवाज़ से ऊपर न जाए।
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.ratio.value = 12; // भारी दबाव (ताकि हॉर्न दब जाए)
        compressor.attack.value = 0.002;
        compressor.release.value = 0.25;

        // 5. NOISE GATE (सन्नाटा करने के लिए)
        scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
        scriptNode.onaudioprocess = function(ev) {
            const input = ev.inputBuffer.getChannelData(0);
            const output = ev.outputBuffer.getChannelData(0);
            for (let i = 0; i < input.length; i++) {
                // अगर आवाज़ 4% से कम है, तो म्यूट
                if (Math.abs(input[i]) < NOISE_THRESHOLD) {
                    output[i] = 0;
                } else {
                    output[i] = input[i];
                }
            }
        };

        // CONNECTIONS
        // Mic -> Booster -> LowCut -> HighCut -> Compressor -> Gate -> Out
        source.connect(gainNode);
        gainNode.connect(lowCut);
        lowCut.connect(highCut);
        highCut.connect(compressor);
        compressor.connect(scriptNode);
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        scriptNode.connect(analyser);

        const dest = audioContext.createMediaStreamDestination();
        scriptNode.connect(dest);

        // RECORDER
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
            statusDiv.innerText = "✅ Saved (Horn Proof)!";
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
        statusDiv.innerText = "🔴 Recording (Anti-Horn)...";
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

// Visualizer (Red Alert Style)
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
            canvasCtx.fillStyle = `hsl(10, 100%, ${Math.min(barHeight + 20, 60)}%)`; 
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
