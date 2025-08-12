export class RingBuffer {
  private buf: Int16Array;
  private writePos = 0;
  private size = 0;

  constructor(capacitySamples: number) {
    this.buf = new Int16Array(capacitySamples);
  }

  clear() {
    this.writePos = 0;
    this.size = 0;
  }

  write(chunk: Int16Array) {
    let start = 0;
    if (chunk.length > this.buf.length) start = chunk.length - this.buf.length;
    for (let i = start; i < chunk.length; i++) {
      this.buf[this.writePos] = chunk[i];
      this.writePos = (this.writePos + 1) % this.buf.length;
      if (this.size < this.buf.length) this.size++;
    }
  }

  drainAll(): Int16Array {
    const out = new Int16Array(this.size);
    const start = (this.writePos - this.size + this.buf.length) % this.buf.length;
    for (let i = 0; i < this.size; i++)
      out[i] = this.buf[(start + i) % this.buf.length];
    this.size = 0;
    return out;
  }

  readLast(nSamples: number): Int16Array {
    const len = Math.min(nSamples, this.size);
    const out = new Int16Array(len);
    const start = (this.writePos - len + this.buf.length) % this.buf.length;
    for (let i = 0; i < len; i++)
      out[i] = this.buf[(start + i) % this.buf.length];
    return out;
  }

  get lengthSamples() {
    return this.size;
  }
  get capacity() {
    return this.buf.length;
  }
}
