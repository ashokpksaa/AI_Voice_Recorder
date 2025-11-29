class RNNoiseProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isRunning = false;
        
        // Buffers
        this.inputBuffer = new Float32Array(480); 
        this.outputBuffer = new Float32Array(480); 
        this.inputBufferPtr = 0;
        this.outputBufferPtr = 0;
        this.outputBufferCount = 0; 

        // WASM Pointers
        this.wasmInstance = null;
        this.context = null;
        this.ptrIn = null;
        this.ptrOut = null;
        this.heapFloat32 = null;

        this.port.onmessage = async (event) => {
            if (event.data.type === 'load-wasm') {
                await this.initWasm(event.data.wasmBytes);
            }
        };
    }

    async initWasm(bytes) {
        try {
            const results = await WebAssembly.instantiate(bytes, {
                env: {
                    memory: new WebAssembly.Memory({ initial: 256 }),
                    table: new WebAssembly.Table({ initial: 0, element: 'anyfunc' }),
                    __stack_pointer: new WebAssembly.Global({value: 'i32', mutable: true}, 0),
                }
            });

            this.wasmInstance = results.instance;
            const { rnnoise_create, malloc, memory } = this.wasmInstance.exports;

            this.context = rnnoise_create(null);
            this.ptrIn = malloc(480 * 4); 
            this.ptrOut = malloc(480 * 4);
            this.heapFloat32 = new Float32Array(memory.buffer);
            
            this.isRunning = true;
            // Worklet को खबर दें कि सब ठीक है
            this.port.postMessage({ type: 'status', message: 'AI_LOADED' });
        } catch (err) {
            this.port.postMessage({ type: 'error', message: err.message });
        }
    }

    process(inputs, outputs, parameters) {
        const inputChannel = inputs[0][0];
        const outputChannel = outputs[0][0];

        // अगर इनपुट नहीं है, तो बाहर निकलो
        if (!inputChannel || !outputChannel) return true;

        // --- SAFETY BYPASS ---
        // अगर AI अभी लोड नहीं हुआ है, तो सीधी आवाज़ पास करो (ताकि सन्नाटा न रहे)
        if (!this.isRunning) {
            outputChannel.set(inputChannel);
            return true;
        }

        // --- AI PROCESSING (अगर लोड हो गया है) ---
        // 1. Input Buffer भरें
        for (let i = 0; i < inputChannel.length; i++) {
            this.inputBuffer[this.inputBufferPtr] = inputChannel[i];
            this.inputBufferPtr++;

            if (this.inputBufferPtr === 480) {
                this.processFrame();
                this.inputBufferPtr = 0;
            }
        }

        // 2. Output Buffer भेजें
        for (let i = 0; i < outputChannel.length; i++) {
            if (this.outputBufferCount > 0) {
                outputChannel[i] = this.outputBuffer[this.outputBufferPtr];
                this.outputBufferPtr++;
                this.outputBufferCount--;
                if (this.outputBufferPtr === 480) this.outputBufferPtr = 0;
            } else {
                outputChannel[i] = 0; 
            }
        }

        return true;
    }

    processFrame() {
        // AI Logic
        for (let i = 0; i < 480; i++) {
            let val = this.inputBuffer[i] * 32768.0;
            this.heapFloat32[(this.ptrIn >> 2) + i] = val;
        }

        this.wasmInstance.exports.rnnoise_process_frame(
            this.context,
            this.ptrOut,
            this.ptrIn
        );

        for (let i = 0; i < 480; i++) {
            let val = this.heapFloat32[(this.ptrOut >> 2) + i];
            this.outputBuffer[i] = val / 32768.0;
        }
        this.outputBufferCount = 480;
        this.outputBufferPtr = 0;
    }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
