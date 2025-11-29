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
let scriptNode; // शोर काटने वाला प्रोसेसर

// सेटिंग्स (इन्हें छेड़ें नहीं)
const NOISE_THRESHOLD = 0.04; // 0.01 से 0.05 (जितना बढ़ाएंगे, उतना ज्यादा शोर कटेगा)
const VOLUME_BOOST = 5.0;     // आवाज़ 5 गुना तेज होगी (क्योंकि AutoGain बंद है)

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
        statusDiv.innerText = "Activating Noise Gate...";
        
        // Timer Start
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        timerDiv.style.color = "#ff3d00";

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // 1. MIC INPUT (Auto Gain OFF - सबसे ज़रूरी)
        // इससे मोबाइल अपनी मर्जी से शोर नहीं बढ़ाएगा
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: false, // ❌ STRICTLY OFF
                googEchoCancellation: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // 2. BOOSTER (Manual Volume Up)
        const gainNode = audioContext.createGain();
        gainNode.gain.value = VOLUME_BOOST;

        // 3. FILTERS (सिर्फ भारी गड़गड़ाहट हटाने के लिए)
        const lowCut = audioContext.createBiquadFilter();
        lowCut.type = 'highpass';
        lowCut.frequency.value = 120; // Fan Rumble remover

        // 4. THE NOISE GATE (ScriptProcessor)
        // यह असली जादू है। यह हर मिलीसेकंड आवाज़ चेक करेगा।
        // अगर आवाज़ धीमी है (शोर/टक-टक), तो उसे 0 कर देगा।
        scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
        
        scriptNode.onaudioprocess = function(audioProcessingEvent) {
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const outputBuffer = audioProcessingEvent.outputBuffer;

            for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
                const inputData = inputBuffer.getChannelData(channel);
                const outputData = outputBuffer.getChannelData(channel);

                for (let i = 0; i < inputData.length; i++) {
                    const sample = inputData[i];
                    
                    // GATE LOGIC:
                    // अगर आवाज़ Threshold (0.04) से कम है, तो सन्नाटा (0)
                    if (Math.abs(sample) < NOISE_THRESHOLD) {
                        outputData[i] = 0; 
                    } else {
                        // अगर आवाज़ तेज है, तो जाने दो
                        outputData[i] = sample;
                    }
                }
            }
        };

        // 5. CONNECTIONS
        // Mic -> Booster -> LowCut -> NoiseGate -> Out
        source.connect(gainNode);
        gainNode.connect(lowCut);
        lowCut.connect(scriptNode);
        
        // Visualizer के लिए
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        scriptNode.connect(analyser);

        const dest = audioContext.createMediaStreamDestination();
        scriptNode.connect(dest);

        // 6. RECORDER
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
            statusDiv.innerText = "✅ Saved (Noise Gated)!";
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
            canvasCtx.fillStyle = `hsl(120, 100%, ${Math.min(barHeight + 20, 60)}%)`; 
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
