import { RingBufferInt16 } from './ringBuffer';

test('RingBufferInt16 overwrites old data', () => {
  const rb = new RingBufferInt16(5);
  rb.push(new Int16Array([1, 2, 3, 4]));
  rb.push(new Int16Array([5, 6, 7]));
  expect(rb.lengthSamples).toBe(5);
  expect(Array.from(rb.drainAll())).toEqual([3, 4, 5, 6, 7]);
  expect(rb.lengthSamples).toBe(0);
});
