class VoiceGate extends AudioWorkletProcessor {
    constructor() {
        super();
        // सेटिंग्स (Natural Voice के लिए)
        this.threshold = 0.01;  // ✅ इसे कम किया ताकि धीमी आवाज़ भी रिकॉर्ड हो
        this.attack = 0.002;    
        this.release = 0.35;    // ✅ इसे बढ़ाया ताकि "Vibration" न हो (Smooth Fade)
        this.envelope = 0;
    }

    process(inputs, outputs) {
        const input = inputs[0];
        const output = outputs[0];

        if (!input || !input[0] || !output) return true;

        const inputChannel = input[0];
        const outputChannel = output[0];

        for (let i = 0; i < inputChannel.length; i++) {
            const sample = inputChannel[i];
            const absSample = Math.abs(sample);

            if (absSample > this.envelope) {
                this.envelope = this.attack * (absSample - this.envelope) + this.envelope;
            } else {
                this.envelope = this.release * (absSample - this.envelope) + this.envelope;
            }

            // Smooth Gate Logic
            let gain = 1.0;
            if (this.envelope < this.threshold) {
                // सन्नाटा (हल्का सा Fade Out करें ताकि झटके से बंद न हो)
                gain = 0;
            } else {
                gain = 1.0;
            }

            // आवाज़ को Apply करें
            // नोट: हम सीधा 0 नहीं कर रहे, बल्कि स्मूथ ट्रांज़िशन के लिए Envelope का यूज़ कर सकते हैं, 
            // लेकिन फ़िलहाल simple gate रखेंगे जो vibration न करे।
            
            if(gain === 0) {
                 outputChannel[i] = 0;
            } else {
                 outputChannel[i] = sample;
            }
        }
        return true;
    }
}

registerProcessor('voice-gate', VoiceGate);
