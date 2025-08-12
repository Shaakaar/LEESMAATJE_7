import { RingBuffer } from './ringBuffer';

test('RingBuffer overwrites old data', () => {
  const rb = new RingBuffer(5);
  rb.write(new Int16Array([1, 2, 3, 4]));
  rb.write(new Int16Array([5, 6, 7]));
  expect(rb.lengthSamples).toBe(5);
  expect(Array.from(rb.drainAll())).toEqual([3, 4, 5, 6, 7]);
  expect(rb.lengthSamples).toBe(0);
});

test('readLast returns most recent samples without draining', () => {
  const rb = new RingBuffer(5);
  rb.write(new Int16Array([1, 2, 3, 4, 5]));
  expect(Array.from(rb.readLast(3))).toEqual([3, 4, 5]);
  expect(rb.lengthSamples).toBe(5);
});
