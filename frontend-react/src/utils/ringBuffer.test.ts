import { RingBuffer } from './ringBuffer';

test('RingBuffer overwrites old data', () => {
  const rb = new RingBuffer(5);
  rb.write(new Int16Array([1, 2, 3, 4]));
  rb.write(new Int16Array([5, 6, 7]));
  expect(rb.lengthSamples).toBe(5);
  expect(Array.from(rb.drainAll())).toEqual([3, 4, 5, 6, 7]);
  expect(rb.lengthSamples).toBe(0);
});

// small ensureRing-like helper mirroring the hook logic
const PRE_ROLL_SEC = 1.5;
function ensureRing(ring: RingBuffer | null, sampleRate: number) {
  const cap = Math.max(1, Math.round(sampleRate * PRE_ROLL_SEC));
  if (!ring || ring.capacity !== cap) {
    ring = new RingBuffer(cap);
  }
  return ring;
}

test('ensureRing is idempotent for same sample rate', () => {
  let ring: RingBuffer | null = null;
  ring = ensureRing(ring, 16000);
  const first = ring;
  ring = ensureRing(ring, 16000);
  expect(ring.capacity).toBe(first.capacity);
  expect(ring).toBe(first);
});

test('ensureRing resizes when sample rate changes', () => {
  let ring: RingBuffer | null = null;
  ring = ensureRing(ring, 16000);
  const firstCap = ring.capacity;
  ring = ensureRing(ring, 8000);
  expect(ring.capacity).not.toBe(firstCap);
  expect(ring.capacity).toBe(Math.max(1, Math.round(8000 * PRE_ROLL_SEC)));
});
