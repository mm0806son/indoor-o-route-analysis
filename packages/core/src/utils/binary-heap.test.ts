import { describe, it, expect } from 'vitest';
import { BinaryHeap } from './binary-heap';

describe('BinaryHeap', () => {
  it('starts empty', () => {
    const heap = new BinaryHeap<number>((a, b) => a - b);
    expect(heap.size).toBe(0);
    expect(heap.pop()).toBeUndefined();
  });

  it('pops a single pushed item', () => {
    const heap = new BinaryHeap<number>((a, b) => a - b);
    heap.push(42);
    expect(heap.size).toBe(1);
    expect(heap.pop()).toBe(42);
    expect(heap.size).toBe(0);
  });

  it('pops items in ascending order for a min-comparator', () => {
    const heap = new BinaryHeap<number>((a, b) => a - b);
    for (const n of [5, 1, 9, 3, 7, 2, 8, 4, 6, 0]) heap.push(n);
    const out: number[] = [];
    while (heap.size > 0) out.push(heap.pop()!);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('handles interleaved push and pop while preserving min order', () => {
    const heap = new BinaryHeap<number>((a, b) => a - b);
    heap.push(5);
    heap.push(3);
    expect(heap.pop()).toBe(3);
    heap.push(1);
    heap.push(4);
    expect(heap.pop()).toBe(1);
    expect(heap.pop()).toBe(4);
    expect(heap.pop()).toBe(5);
    expect(heap.pop()).toBeUndefined();
  });

  it('keeps duplicates and returns them all', () => {
    const heap = new BinaryHeap<number>((a, b) => a - b);
    for (const n of [2, 2, 1, 2, 1]) heap.push(n);
    const out: number[] = [];
    while (heap.size > 0) out.push(heap.pop()!);
    expect(out).toEqual([1, 1, 2, 2, 2]);
  });

  it('orders objects by a custom comparator field', () => {
    interface Item { id: string; f: number; }
    const heap = new BinaryHeap<Item>((a, b) => a.f - b.f);
    heap.push({ id: 'c', f: 30 });
    heap.push({ id: 'a', f: 10 });
    heap.push({ id: 'b', f: 20 });
    expect(heap.pop()!.id).toBe('a');
    expect(heap.pop()!.id).toBe('b');
    expect(heap.pop()!.id).toBe('c');
  });

  it('orders tuple entries by their first element (Dijkstra usage)', () => {
    const heap = new BinaryHeap<[number, string]>((a, b) => a[0] - b[0]);
    heap.push([3, 'x']);
    heap.push([1, 'y']);
    heap.push([2, 'z']);
    expect(heap.pop()).toEqual([1, 'y']);
    expect(heap.pop()).toEqual([2, 'z']);
    expect(heap.pop()).toEqual([3, 'x']);
  });

  it('matches a sorted array for a large random sequence', () => {
    const heap = new BinaryHeap<number>((a, b) => a - b);
    const input = Array.from({ length: 500 }, () => Math.floor(Math.random() * 1000));
    for (const n of input) heap.push(n);
    const out: number[] = [];
    while (heap.size > 0) out.push(heap.pop()!);
    expect(out).toEqual([...input].sort((a, b) => a - b));
  });
});
