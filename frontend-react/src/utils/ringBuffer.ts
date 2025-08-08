export class RingBufferInt16 {
  private buf: Int16Array;
  private write = 0;
  private size = 0;

  constructor(capacitySamples: number) {
    this.buf = new Int16Array(capacitySamples);
  }

  clear() {
    this.write = 0;
    this.size = 0;
  }

  push(chunk: Int16Array) {
    let start = 0;
    if (chunk.length > this.buf.length) start = chunk.length - this.buf.length;
    for (let i = start; i < chunk.length; i++) {
      this.buf[this.write] = chunk[i];
      this.write = (this.write + 1) % this.buf.length;
      if (this.size < this.buf.length) this.size++;
    }
  }

  drainAll(): Int16Array {
    const out = new Int16Array(this.size);
    const start = (this.write - this.size + this.buf.length) % this.buf.length;
    for (let i = 0; i < this.size; i++)
      out[i] = this.buf[(start + i) % this.buf.length];
    this.size = 0;
    return out;
  }

  get lengthSamples() {
    return this.size;
  }
  get capacity() {
    return this.buf.length;
  }
}
