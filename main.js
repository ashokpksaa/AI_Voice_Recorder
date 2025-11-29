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
        statusDiv.innerText = "Initializing Noise & Echo Killer...";
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // 1. Advanced Mic Constraints (Chrome/Android Special)
        // हम 'goog' प्रीफिक्स का यूज़ करेंगे जो Android पर ज्यादा असरदार है
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true, // वॉल्यूम कम-ज्यादा करने के लिए
                googEchoCancellation: true,
                googExperimentalEchoCancellation: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // --- AUDIO CLEANING CHAIN ---

        // A. High-Pass Filter (Rumble Remover)
        // 100Hz से नीचे का शोर (Traffic/AC) पूरी तरह काट देंगे
        const highPass = audioContext.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 100; 

        // B. "De-Mudder" (Echo Remover) - यह गूंज हटाएगा
        // कमरों की गूंज अक्सर 300Hz-400Hz पर होती है। हम इसे दबा देंगे।
        const echoCut = audioContext.createBiquadFilter();
        echoCut.type = 'peaking';
        echoCut.frequency.value = 350; // गूंज का केंद्र
        echoCut.Q.value = 1.5;         // चौड़ाई
        echoCut.gain.value = -10;      // 10dB कम कर दिया (Echo गायब)

        // C. Hiss Filter (FM Noise Remover)
        // 7000Hz के ऊपर का तीखा शोर काट देंगे
        const lowPass = audioContext.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 7000;

        // D. Gentle Compressor
        // पिछली बार Ratio 8 था, जिसने शोर बढ़ा दिया था। अब हम Ratio 3 रखेंगे।
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -25;
        compressor.knee.value = 40;
        compressor.ratio.value = 3;     // ✅ सॉफ्ट कर दिया (शोर नहीं बढ़ेगा)
        compressor.attack.value = 0.005;
        compressor.release.value = 0.25;

        // --- CONNECTIONS ---
        // Mic -> HighPass -> EchoCut -> LowPass -> Compressor -> Out
        source.connect(highPass);
        highPass.connect(echoCut);
        echoCut.connect(lowPass);
        lowPass.connect(compressor);

        // Visualizer Setup
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
            statusDiv.innerText = "✅ Crystal Clear Audio Saved!";
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
        statusDiv.innerText = "🔴 Recording (Echo & Noise Off)...";
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
            // साफ़ ब्लू कलर (Cool Look)
            canvasCtx.fillStyle = `hsl(210, 100%, ${Math.min(barHeight + 20, 70)}%)`;
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
