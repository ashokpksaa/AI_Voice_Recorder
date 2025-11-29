/**
 * Advanced RNNoise Processor with Circular Buffer
 * Handles the mismatch between WebAudio (128 frames) and RNNoise (480 frames)
 */

class RNNoiseProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isRunning = false;
        
        // Buffers
        this.inputBuffer = new Float32Array(480); // To store incoming audio until we have 480
        this.outputBuffer = new Float32Array(480); // To store processed audio
        this.inputBufferPtr = 0;
        this.outputBufferPtr = 0;
        this.outputBufferCount = 0; // How much processed audio is ready to send back

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
            const { rnnoise_create, rnnoise_process_frame, malloc, memory } = this.wasmInstance.exports;

            this.context = rnnoise_create(null);
            this.ptrIn = malloc(480 * 4); // 4 bytes per float
            this.ptrOut = malloc(480 * 4);
            this.heapFloat32 = new Float32Array(memory.buffer);
            
            this.isRunning = true;
            console.log("✅ AI Model Loaded & Buffers Ready");
        } catch (err) {
            console.error("Failed to load WASM:", err);
        }
    }

    process(inputs, outputs, parameters) {
        // If mic is off or AI not loaded, pass silence or stop
        if (!inputs[0] || !inputs[0][0]) return true;
        
        const inputChannel = inputs[0][0];  // Raw Mic Data (128 samples)
        const outputChannel = outputs[0][0]; // Output to speaker/recorder (128 samples)

        if (!this.isRunning) {
            // AI ready nahi hai to silent return karein (ya bypass karein)
            return true;
        }

        // --- STEP 1: Fill Input Buffer ---
        for (let i = 0; i < inputChannel.length; i++) {
            this.inputBuffer[this.inputBufferPtr] = inputChannel[i];
            this.inputBufferPtr++;

            // Agar 480 samples jama ho gaye, to AI se process karao
            if (this.inputBufferPtr === 480) {
                this.processFrame();
                this.inputBufferPtr = 0; // Reset counter
            }
        }

        // --- STEP 2: Send Output Buffer ---
        for (let i = 0; i < outputChannel.length; i++) {
            // Agar hamare paas processed data hai
            if (this.outputBufferCount > 0) {
                outputChannel[i] = this.outputBuffer[this.outputBufferPtr];
                this.outputBufferPtr++;
                this.outputBufferCount--;

                // Agar output buffer khatam ho gaya, reset pointer
                if (this.outputBufferPtr === 480) {
                    this.outputBufferPtr = 0;
                }
            } else {
                // Agar data ready nahi hai to silence bhejo (buffering lag)
                outputChannel[i] = 0;
            }
        }

        return true;
    }

    processFrame() {
        // 1. Copy data to WASM Memory
        for (let i = 0; i < 480; i++) {
            // Float (-1 to 1) ko PCM 16-bit me badalna (RNNoise requirement)
            // Scaling factor 32768.0
            let val = this.inputBuffer[i] * 32768.0;
            this.heapFloat32[(this.ptrIn >> 2) + i] = val;
        }

        // 2. Call AI Function
        this.wasmInstance.exports.rnnoise_process_frame(
            this.context,
            this.ptrOut,
            this.ptrIn
        );

        // 3. Copy result back from WASM Memory
        for (let i = 0; i < 480; i++) {
            // Wapas Float me badalna
            let val = this.heapFloat32[(this.ptrOut >> 2) + i];
            this.outputBuffer[i] = val / 32768.0;
        }

        // Batao ki naya data ready hai
        this.outputBufferCount = 480;
        this.outputBufferPtr = 0;
    }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);