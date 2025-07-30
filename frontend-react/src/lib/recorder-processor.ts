class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const buffer = input[0];
      const pcm = new Int16Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        pcm[i] = s * 32767;
      }
      this.port.postMessage(pcm);
    }
    return true;
  }
}

registerProcessor('recorder-processor', RecorderProcessor);
export {};
