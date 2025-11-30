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
        statusDiv.innerText = "Initializing AI Logic...";
        
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        timerDiv.style.color = "#ff3d00";

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // 1. HARDWARE AI (Base Layer)
        // ब्राउज़र का अपना AI सबसे पहले शोर को कम करेगा
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true, // Krisp जैसा बेसिक AI
                autoGainControl: true,  // वॉल्यूम बैलेंस
                channelCount: 1
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // --- THE "KRISP" STRATEGY (Multi-Stage Isolation) ---
        // हम आवाज़ को तराशेंगे (Sculpting), सिर्फ काटेंगे नहीं।

        // STAGE 1: BRICK WALL FILTERS (फालतू फ्रीक्वेंसी बाहर)
        
        // A. Rumble Wall (150Hz) - पंखा/इंजन खत्म
        const lowCut = audioContext.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 150; 
        lowCut.Q.value = 1.0; // Sharpness

        // B. Hiss Wall (3500Hz) - हॉर्न/सीटी खत्म
        // इंसान की साफ़ आवाज़ 3000-3500Hz तक ही होती है।
        const highCut = audioContext.createBiquadFilter();
        highCut.type = 'lowpass';
        highCut.frequency.value = 3500; 
        highCut.Q.value = 1.0;

        // STAGE 2: VOCAL ENHANCEMENT (आवाज़ को साफ़ करना)
        
        // C. Mud Remover (300Hz) - गूंज हटाना
        const mudCut = audioContext.createBiquadFilter();
        mudCut.type = 'peaking';
        mudCut.frequency.value = 300;
        mudCut.gain.value = -10; // -10dB

        // D. Clarity Boost (2000Hz) - आवाज़ में चमक लाना
        const clarityBoost = audioContext.createBiquadFilter();
        clarityBoost.type = 'peaking';
        clarityBoost.frequency.value = 2000;
        clarityBoost.gain.value = 5; // +5dB

        // STAGE 3: DYNAMICS PROCESSING (Noise Gate + Compressor)
        
        // E. Compressor (आवाज़ को एक लेवल पर रखना)
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 20;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.005;
        compressor.release.value = 0.20;

        // F. EXPANDER / GATE (सन्नाटा करना)
        // यह Krisp का सबसे अहम हिस्सा है। जब आप चुप हों, यह माइक बंद कर देगा।
        const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
        
        // Settings for Gate
        const NOISE_FLOOR = 0.04; // 4% से नीचे शोर माना जाएगा
        let envelope = 0;

        scriptNode.onaudioprocess = function(ev) {
            const input = ev.inputBuffer.getChannelData(0);
            const output = ev.outputBuffer.getChannelData(0);

            for (let i = 0; i < input.length; i++) {
                const sample = input[i];
                const amplitude = Math.abs(sample);

                // Smooth Envelope Follower (आवाज़ का पीछा करना)
                if (amplitude > envelope) {
                    envelope = 0.001 * (amplitude - envelope) + envelope;
                } else {
                    envelope = 0.0001 * (amplitude - envelope) + envelope;
                }

                // SMART GATE LOGIC
                if (envelope < NOISE_FLOOR) {
                    // अगर शोर है, तो धीरे-धीरे आवाज़ कम करो (Fade Out)
                    // सीधा 0 नहीं करेंगे वरना आवाज़ कटेगी
                    output[i] = sample * 0.1; 
                } else {
                    // अगर आवाज़ है, तो पूरी जाने दो
                    output[i] = sample;
                }
            }
        };

        // CONNECTIONS (The Chain)
        // Source -> LowCut -> HighCut -> MudCut -> Clarity -> Compressor -> Gate -> Out
        source.connect(lowCut);
        lowCut.connect(highCut);
        highCut.connect(mudCut);
        mudCut.connect(clarityBoost);
        clarityBoost.connect(compressor);
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
            statusDiv.innerText = "✅ Saved (Voice Only)!";
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
        statusDiv.innerText = "🔴 Recording (Vocal Isolation)...";
        statusDiv.style.color = "#ff3d00";

    } catch (err) {
        clearInterval(timerInterval);
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
        canvasCtx.fillStyle = '#000';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        let x = 0;
        let barWidth = (canvas.width / bufferLength) * 2.5;
        for (let i = 0; i < bufferLength; i++) {
            let barHeight = dataArray[i] / 2;
            canvasCtx.fillStyle = `hsl(${barHeight + 160},100%,50%)`; // Aqua Blue
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
