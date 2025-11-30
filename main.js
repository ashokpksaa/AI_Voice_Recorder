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
        statusDiv.innerText = "Loading AI Filters...";
        
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);
        timerDiv.style.color = "#ff3d00";

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();

        // 1. HARDWARE AI INPUT (The Foundation)
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true, // Auto Volume ON (AI needs consistent volume)
                googEchoCancellation: true,
                googNoiseSuppression: true,
                googHighpassFilter: true
            }
        });

        source = audioContext.createMediaStreamSource(stream);

        // --- THE "MULTI-BAND" AI STRATEGY ---
        // हम Krisp की तरह ऑडियो को 3 अलग-अलग बैंड्स में तोड़ेंगे।
        // Low Band: पंखा/इंजन
        // Mid Band: आपकी आवाज़
        // High Band: हॉर्न/हिस
        // हम Low और High को सख्ती से काटेंगे, और Mid को साफ़ रखेंगे।

        // SPLITTER (3 रास्तों में बांटना)
        const lowSplit = audioContext.createBiquadFilter();
        lowSplit.type = 'lowpass';
        lowSplit.frequency.value = 250; // 0-250Hz (शोर का घर)

        const midSplit = audioContext.createBiquadFilter();
        midSplit.type = 'bandpass';
        midSplit.frequency.value = 1500; // 250-4000Hz (आपकी आवाज़)
        midSplit.Q.value = 0.5; // Wide range

        const highSplit = audioContext.createBiquadFilter();
        highSplit.type = 'highpass';
        highSplit.frequency.value = 4000; // 4000Hz+ (हॉर्न/सीटी)

        // PROCESSORS (सफाई अभियान)
        
        // 1. Low Band Cleaner (पंखा काटना)
        const lowGain = audioContext.createGain();
        lowGain.gain.value = 0.0; // 100% MUTE (पंखे की रेंज पूरी तरह बंद)

        // 2. Mid Band Booster (आवाज़ को निखारना)
        const midGain = audioContext.createGain();
        midGain.gain.value = 1.2; // आवाज़ को थोड़ा ऊपर उठाओ

        // 3. High Band Cleaner (हॉर्न काटना)
        const highGain = audioContext.createGain();
        highGain.gain.value = 0.1; // 90% MUTE (हॉर्न/हिस को बहुत धीमा कर दो)

        // MERGER (वापस जोड़ना)
        // हम तीनों को वापस एक साथ जोड़ेंगे
        const merger = audioContext.createChannelMerger(1);

        // CONNECTIONS (The Web)
        source.connect(lowSplit);
        source.connect(midSplit);
        source.connect(highSplit);

        lowSplit.connect(lowGain);
        midSplit.connect(midGain);
        highSplit.connect(highGain);

        // सब कुछ वापस Compressor में जाएगा
        lowGain.connect(merger, 0, 0); // (नोट: Merger थोड़ा जटिल है, हम सीधा Compressor यूज़ करेंगे)
        
        // SIMPLIFIED MULTI-BAND CHAIN (Reliable Method)
        // ऊपर वाला Splitter कभी-कभी Phase Issue करता है, इसलिए हम "Serial Chain" यूज़ करेंगे जो Krisp जैसा ही काम करता है।

        // LAYER 1: DEEP CLEANING
        const deepCut = audioContext.createBiquadFilter();
        deepCut.type = 'highpass';
        deepCut.frequency.value = 180; // पंखे की जड़ काटी

        // LAYER 2: SPEECH ISOLATION (सिर्फ इंसानी रेंज रखो)
        const speechIso = audioContext.createBiquadFilter();
        speechIso.type = 'lowpass';
        speechIso.frequency.value = 3500; // इसके ऊपर सब कचरा है (हॉर्न/सीटी)

        // LAYER 3: PRESENCE (आवाज़ को सामने लाना)
        const presence = audioContext.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 1000; // इंसानी आवाज़ का कोर
        presence.gain.value = 5; // Boost
        presence.Q.value = 1.0;

        // LAYER 4: INTELLIGENT GATE (AI Logic)
        const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);
        const SILENCE = 0.03;
        
        scriptNode.onaudioprocess = function(ev) {
            const input = ev.inputBuffer.getChannelData(0);
            const output = ev.outputBuffer.getChannelData(0);
            
            for (let i = 0; i < input.length; i++) {
                // अगर आवाज़ बहुत धीमी है, तो उसे बिल्कुल चुप कर दो
                if (Math.abs(input[i]) < SILENCE) {
                    output[i] = 0;
                } else {
                    // अगर आवाज़ है, तो उसे थोड़ा साफ़ (Sharp) करो
                    output[i] = input[i] * 1.1; 
                }
            }
        };

        // LAYER 5: COMPRESSOR (Final Polish)
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.15;

        // FINAL CONNECTIONS
        source.connect(deepCut);
        deepCut.connect(speechIso);
        speechIso.connect(presence);
        presence.connect(compressor);
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
            statusDiv.innerText = "✅ Saved (AI Logic)!";
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
        statusDiv.innerText = "🔴 Recording (AI Filter Active)...";
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
            canvasCtx.fillStyle = `hsl(${barHeight + 140},100%,50%)`; // Tech Green
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };
    draw();
}
