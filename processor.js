class VoiceProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // सेटिंग्स (इन्हें शोर के हिसाब से एडजस्ट किया जा सकता है)
        this.threshold = 0.02;  // सेंसिटिविटी (0.01 से 0.05 के बीच रखें)
        this.attack = 0.003;    // आवाज़ कितनी जल्दी खुले
        this.release = 0.25;    // आवाज़ बंद होने में कितना समय ले
        
        this.envelope = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        // अगर कोई ऑडियो नहीं आ रहा, तो बाहर निकलें
        if (!input || !input[0] || !output || !output[0]) return true;

        const inputChannel = input[0];
        const outputChannel = output[0];

        for (let i = 0; i < inputChannel.length; i++) {
            const sample = inputChannel[i];
            const absSample = Math.abs(sample);

            // 1. एन्वेलप (Envelope) कैलकुलेशन (आवाज़ का लेवल नापना)
            if (absSample > this.envelope) {
                this.envelope = this.attack * (absSample - this.envelope) + this.envelope;
            } else {
                this.envelope = this.release * (absSample - this.envelope) + this.envelope;
            }

            // 2. नॉइज़ गेट लॉजिक (Noise Gate Logic)
            let gain = 1.0;
            
            // अगर आवाज़ थ्रेशोल्ड से कम है (यानी सिर्फ शोर है), तो म्यूट करें
            if (this.envelope < this.threshold) {
                // स्मूथ म्यूटिंग (ताकि आवाज़ कटे नहीं)
                gain = Math.max(0, gain - 0.05); 
                outputChannel[i] = 0; // सन्नाटा (Silence)
            } else {
                // इंसान बोल रहा है -> पास करो
                gain = 1.0;
                outputChannel[i] = sample;
            }
        }

        return true;
    }
}

registerProcessor('rnnoise-processor', VoiceProcessor);
