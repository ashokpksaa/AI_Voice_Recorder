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
let silenceTimer;
let isSpeaking = false;

// --- SETTINGS (आवाज़ को साफ़ करने की मशीन) ---
const NOISE_THRESHOLD = 0.02; // इससे धीमी आवाज़ (पंखा/दूर का शोर) काट दी जाएगी
const VOICE_MIN_FREQ = 150;   // 150Hz से नीचे की आवाज़ (पंखा/AC) बंद
const VOICE_MAX_FREQ = 3500;  // 3500Hz से ऊपर की आवाज़ (हिस/सीटी) बंद

startBtn.onclick = async () => {
    try {
        statusDiv.innerText = "Starting Voice Isolator...";
        
        // 1. Audio Context Setup
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // 2. Microphone Input (ब्राउज़र का अपना Noise Cancel भी ऑन रखेंगे)
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // --- STEP 1: FILTERS (पंखा और हॉर्न काटने के लिए) ---
        
        // A. High-Pass Filter (पंखे की "धड़धड़" आवाज़ हटाएगा)
        const lowCut = audioContext.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = VOICE_MIN_FREQ;

        // B. Low-Pass Filter (तीखी "Sss" और दूर का शोर हटाएगा)
        const highCut = audioContext.createBiquadFilter();
        highCut.type = 'lowpass';
        highCut.frequency.value = VOICE_MAX_FREQ;

        // --- STEP 2: NOISE GATE (टेबल की टक-टक और बैकग्राउंड शोर के लिए) ---
        // हम एक ScriptProcessor का उपयोग करेंगे जो "Live" गेटिंग करेगा
        const noiseGate = audioContext.createScriptProcessor(4096, 1, 1);
        
        noiseGate.onaudioprocess = (audioProcessingEvent) => {
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const outputBuffer = audioProcessingEvent.outputBuffer;
            
            for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
                const inputData = inputBuffer.getChannelData(channel);
                const outputData = outputBuffer.getChannelData(channel);

                for (let i = 0; i < inputData.length; i++) {
                    const sample = inputData[i];
                    
                    // अगर आवाज़ थ्रेशोल्ड से कम है (शोर है), तो उसे 0 कर दो
                    if (Math.abs(sample) < NOISE_THRESHOLD) {
                        outputData[i] = 0; 
                    } else {
                        // अगर आवाज़ है, तो उसे जाने दो
                        outputData[i] = sample;
                    }
                }
            }
        };

        // --- STEP 3: VISUALIZER (आवाज़ देखने के लिए) ---
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;

        // Connections: Mic -> HighPass -> LowPass -> NoiseGate -> Analyser -> Destination
        source.connect(lowCut);
        lowCut.connect(highCut);
        highCut.connect(noiseGate);
        noiseGate.connect(analyser);
        
        const dest = audioContext.createMediaStreamDestination();
        noiseGate.connect(dest); // रिकॉर्डर को साफ़ आवाज़ भेजें

        // --- STEP 4: RECORDER ---
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
            statusDiv.innerText = "✅ Clean Audio Saved!";
            statusDiv.style.color = "#00e676";
        };

        mediaRecorder.start();
        visualize(); // स्क्रीन पर वेवफॉर्म शुरू

        // UI Updates
        startBtn.disabled = true;
        startBtn.style.opacity = "0.5";
        stopBtn.disabled = false;
        stopBtn.style.opacity = "1";
        stopBtn.style.pointerEvents = "all";
        stopBtn.style.background = "#ff3d00";
        statusDiv.innerText = "🔴 Recording (Filters Active)...";
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

// --- VISUALIZER FUNCTION ---
let drawVisual;
function visualize() {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
        drawVisual = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = '#000';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2;
            canvasCtx.fillStyle = `rgb(${barHeight + 100}, 50, 50)`;
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
