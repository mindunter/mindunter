// Runs on the audio thread: forwards microphone / system-audio samples to the page.
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length) {
      const n = input[0].length;
      const mono = new Float32Array(n);
      for (let c = 0; c < input.length; c++) {
        const d = input[c];
        for (let i = 0; i < n; i++) mono[i] += d[i] / input.length;
      }
      this.port.postMessage(mono, [mono.buffer]);
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
