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
        statusDiv.innerText = "Activating Anti-Hiss Mode...";
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // 1. Microphone Input (Browser AI ON)
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // --- ANTI-HISS & CLEANUP CHAIN ---

        // A. High-Pass (85Hz) - भारी रम्बल हटाने के लिए (AC/Fan)
        const lowCut = audioContext.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 85; 

        // B. Low-Pass Filter (Hiss Remover) - यह है असली जादू
        // FM वाला शोर (Hiss) आमतौर पर 10,000Hz के ऊपर होता है।
        // हम 8000Hz के ऊपर का सब कुछ धीरे-धीरे काट देंगे। 
        // इससे आवाज़ साफ़ रहेगी, लेकिन "सर-सर" गायब हो जाएगी।
        const hissFilter = audioContext.createBiquadFilter();
        hissFilter.type = 'lowpass'; 
        hissFilter.frequency.value = 8000; // 8kHz से ऊपर कट (Hiss Zone)
        hissFilter.Q.value = 0.7;          // Smooth slope

        // C. Parametric EQ (Mid-Range Boost)
        // चूंकि हमने ऊपर से Hiss काटा है, आवाज़ थोड़ी दबी हुई लग सकती है।
        // इसलिए हम आवाज़ की "जान" (Presense) को वापस लाएंगे (2500Hz पर)।
        const presenceBoost = audioContext.createBiquadFilter();
        presenceBoost.type = 'peaking';
        presenceBoost.frequency.value = 2500;
        presenceBoost.gain.value = 3; // हल्का सा बूस्ट
        presenceBoost.Q.value = 1.0;

        // D. Soft Compressor (शोर को आपकी आवाज़ के नीचे दबाने के लिए)
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.knee.value = 20;
        compressor.ratio.value = 8;     
        compressor.attack.value = 0.005; 
        compressor.release.value = 0.15; // जल्दी छोड़ेगा ताकि "Pumping" न हो

        // --- CONNECTIONS ---
        // Mic -> LowCut -> HissFilter -> Presence -> Compressor -> Out
        source.connect(lowCut);
        lowCut.connect(hissFilter);
        hissFilter.connect(presenceBoost);
        presenceBoost.connect(compressor);

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
            statusDiv.innerText = "✅ Hiss Removed! Saved.";
            statusDiv.style.color = "#00e676";
        };

        mediaRecorder.start();
        visualize();

        startBtn.disabled = true;
        startBtn.style.opacity = "0.5";
        stopBtn.disabled = false;
        stopBtn.style.opacity = "1";
        stopBtn.style.pointerEvents = "all";
        stopBtn.style.background = "#ff3d00";
        statusDiv.innerText = "🔴 Recording (Anti-Hiss Active)...";
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
            canvasCtx.fillStyle = `hsl(${barHeight + 120}, 100%, 50%)`; // Greenish bars
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
