class TranslateCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0];

    if (!input || input.length === 0) {
      return true;
    }

    const outputLength = Math.max(1, Math.round((input.length * 16000) / sampleRate));
    const pcm16 = new Int16Array(outputLength);

    for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
      const start = Math.floor((outputIndex * sampleRate) / 16000);
      const end = Math.min(
        input.length,
        Math.floor(((outputIndex + 1) * sampleRate) / 16000)
      );

      let total = 0;
      let count = 0;

      for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
        total += input[inputIndex] ?? 0;
        count += 1;
      }

      const sample = Math.max(-1, Math.min(1, count > 0 ? total / count : 0));
      pcm16[outputIndex] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}

registerProcessor("translate-capture-processor", TranslateCaptureProcessor);
