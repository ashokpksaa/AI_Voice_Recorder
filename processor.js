class VoiceGate extends AudioWorkletProcessor {
    constructor() {
        super();
        // सेटिंग्स
        this.threshold = 0.015; // अगर शोर ज्यादा आ रहा है, तो इसे 0.02 या 0.03 कर दें
        this.attack = 0.003;
        this.release = 0.20;
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

            // आवाज़ की ताकत नापना
            if (absSample > this.envelope) {
                this.envelope = this.attack * (absSample - this.envelope) + this.envelope;
            } else {
                this.envelope = this.release * (absSample - this.envelope) + this.envelope;
            }

            // गेट लॉजिक
            if (this.envelope < this.threshold) {
                // पूरी तरह सन्नाटा कर दो (Absolute Silence)
                outputChannel[i] = 0; 
            } else {
                // आवाज़ जाने दो
                outputChannel[i] = sample;
            }
        }
        return true;
    }
}

registerProcessor('voice-gate', VoiceGate);
