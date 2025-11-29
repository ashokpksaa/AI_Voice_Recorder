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
        statusDiv.innerText = "Setting up Studio Mode...";
        
        // 1. Audio Context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // 2. Microphone Input (ब्राउज़र का हार्डवेयर नॉइज़ कैंसलेशन ON)
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true, // यह सबसे ज़रूरी है
                autoGainControl: true   // यह वॉल्यूम बैलेंस करेगा
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // --- STUDIO FILTERS (आवाज़ को साफ़ करने के लिए) ---

        // A. High-Pass Filter (सिर्फ बहुत भारी रम्बल हटाएगा, आवाज़ का बेस नहीं)
        // पहले यह 150Hz था, अब हम इसे 85Hz कर रहे हैं ताकि आपकी आवाज़ "पतली" न हो।
        const lowCut = audioContext.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 85; 

        // B. Treble Boost (आवाज़ में चमक/साफ़-सफाई लाने के लिए)
        // हम Low-Pass हटाकर High-Shelf लगा रहे हैं। यह आवाज़ को साफ़ करेगा।
        const highShelf = audioContext.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 4000; // 4kHz के ऊपर
        highShelf.gain.value = 2;         // थोड़ी चमक बढ़ाएं

        // C. Compressor (यह सबसे ज़रूरी है - शोर को दबाने के लिए)
        // यह शोर और आवाज़ के बीच का अंतर बढ़ा देगा।
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24; // सेंसिटिविटी
        compressor.knee.value = 30;       // स्मूथनेस
        compressor.ratio.value = 12;      // यह शोर को 12 गुना दबा देगा
        compressor.attack.value = 0.003;  // तुरंत काम करेगा
        compressor.release.value = 0.25;  // धीरे से छोड़ेगा

        // --- CONNECTIONS ---
        // Mic -> LowCut -> HighShelf -> Compressor -> Destination
        source.connect(lowCut);
        lowCut.connect(highShelf);
        highShelf.connect(compressor);

        // Visualizer के लिए
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        compressor.connect(analyser); // हम प्रोसेस की हुई आवाज़ देखेंगे

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
            statusDiv.innerText = "✅ Studio Quality Saved!";
            statusDiv.style.color = "#00e676";
        };

        mediaRecorder.start();
        visualize(); 

        // UI Updates
        startBtn.disabled = true;
        startBtn.style.opacity = "0.5";
        stopBtn.disabled = false;
        stopBtn.style.opacity = "1";
        stopBtn.style.pointerEvents = "all";
        stopBtn.style.background = "#ff3d00";
        statusDiv.innerText = "🔴 Recording (Studio Mode)...";
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
            // कलरफुल बार्स
            canvasCtx.fillStyle = `hsl(${barHeight + 100}, 100%, 50%)`;
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
