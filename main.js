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

// Settings
const VAD_THRESHOLD = 15; // आवाज़ की सेंसिटिविटी (10-30 के बीच)
const SILENCE_DELAY = 500; // 0.5 सेकंड चुप रहने पर रिकॉर्डिंग रुकेगी

startBtn.onclick = async () => {
    try {
        statusDiv.innerText = "Requesting Microphone...";
        
        // 1. Hardware AI को Activate करना (सबसे ज़रूरी स्टेप)
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,   // गूंज हटाओ
                noiseSuppression: true,   // शोर हटाओ (Hardware level)
                autoGainControl: true,    // वॉल्यूम बैलेंस करो
                channelCount: 1
            }
        });

        // 2. Audio Context & Analyser (आवाज़ को देखने के लिए)
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        // 3. Media Recorder सेटअप
        // मोबाइल और PC के लिए बेस्ट फॉर्मेट ढूंढना
        let options = { mimeType: 'audio/webm;codecs=opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'audio/mp4' }; // Safari (iPhone) के लिए
        }

        mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            audioPlayer.src = url;
            audioPlayer.style.display = 'block';
            audioChunks = [];
            statusDiv.innerText = "✅ Recording Saved!";
            statusDiv.style.color = "#00e676";
        };

        // 4. Smart VAD Logic (सन्नाटा हटाने वाला जासूस)
        mediaRecorder.start(); 
        visualizeAndDetect(); // मॉनिटरिंग शुरू

        // UI अपडेट
        startBtn.disabled = true;
        startBtn.style.opacity = "0.5";
        stopBtn.disabled = false;
        stopBtn.style.opacity = "1";
        stopBtn.style.pointerEvents = "all";
        stopBtn.style.background = "#ff3d00";

    } catch (err) {
        statusDiv.innerText = "Error: " + err.message;
        statusDiv.style.color = "red";
    }
};

stopBtn.onclick = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        source.mediaStream.getTracks().forEach(track => track.stop()); // Mic बंद
        if(audioContext) audioContext.close();
    }
    
    startBtn.disabled = false;
    startBtn.style.opacity = "1";
    stopBtn.disabled = true;
    stopBtn.style.opacity = "0.5";
    stopBtn.style.pointerEvents = "none";
    cancelAnimationFrame(drawVisual); // एनिमेशन रोको
};

// --- जादुई फंक्शन: जो आवाज़ को देखेगा और रिकॉर्डर को कंट्रोल करेगा ---
let drawVisual;
function visualizeAndDetect() {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
        drawVisual = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        // 1. औसत वॉल्यूम निकालें (Average Volume)
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        let averageVolume = sum / bufferLength;

        // 2. VAD Logic (क्या इंसान बोल रहा है?)
        if (averageVolume > VAD_THRESHOLD) {
            // बोल रहा है
            if (mediaRecorder.state === "paused") {
                mediaRecorder.resume(); // रिकॉर्डिंग फिर से शुरू
            }
            statusDiv.innerText = "🔴 Recording Voice...";
            statusDiv.style.color = "#ff3d00";
            clearTimeout(silenceTimer); // टाइमर रीसेट
            isSpeaking = true;
        } else {
            // चुप है (सन्नाटा)
            if (isSpeaking) {
                // तुरंत बंद मत करो, थोड़ा इंतज़ार करो (ताकि शब्द न कटें)
                isSpeaking = false;
                silenceTimer = setTimeout(() => {
                    if (mediaRecorder.state === "recording") {
                        mediaRecorder.pause(); // रिकॉर्डिंग रोको (Pause)
                        statusDiv.innerText = "⏸️ Paused (Silence)...";
                        statusDiv.style.color = "#aaa";
                    }
                }, SILENCE_DELAY);
            }
        }

        // 3. Visualizer Draw करें (Canvas पर)
        canvasCtx.fillStyle = '#000';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2;
            // अगर रिकॉर्ड हो रहा है तो हरा, नहीं तो ग्रे
            if(mediaRecorder.state === "recording") {
                canvasCtx.fillStyle = `rgb(${barHeight + 100}, 50, 50)`;
            } else {
                canvasCtx.fillStyle = `rgb(50, 50, 50)`;
            }
            canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
    };

    draw();
}
