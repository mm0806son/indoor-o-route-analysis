import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { CandidateTable, formatRouteTime } from './candidate-table';
afterEach(cleanup);
it('shows six directly selectable alternatives with distance, difference, time and difficulty', () => {
  vi.stubGlobal('React', React);
  const rows = Array.from({ length: 6 }, (_, i) => ({
    distance: 100 + i * 5,
    distanceDelta: i * 5,
    distanceRatio: 1 + i * 0.05,
    estimatedTime: 30 + i,
    timeDelta: i,
    difficulty: 20 + i,
    totalClimb: 0,
    description: 'A, B',
    labels: ['A', 'B'],
    reasons: ['simple' as const],
    branchingPoints: 7,
    decisionPoints: 3,
    stairs: 2,
    repetitionRatio: 0.25,
    floors: 2,
    nearbyVariants: 4,
  }));
  const select = vi.fn();
  render(<CandidateTable metrics={rows} selected={0} onSelect={select} />);
  const list = screen.getByRole('list', { name: '候选路线' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(6);
  expect(screen.getByText('Route 1: AB')).toBeTruthy();
  const first = screen.getByRole('button', { name: '选择方案 1' });
  expect(within(first).getByText('simple')).toBeTruthy();
  expect(within(first).getByLabelText('分支点：7')).toBeTruthy();
  expect(within(first).getByLabelText('决策点：3')).toBeTruthy();
  expect(within(first).getByLabelText('楼梯：2')).toBeTruthy();
  expect(within(first).getByLabelText('重复路段：25%')).toBeTruthy();
  expect(first.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: '选择方案 6' }));
  expect(select).toHaveBeenCalledWith(5);
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByText(/组织者推荐/)).toBeNull();
});

it('formats time like the Route Analysis summary', () => {
  expect(formatRouteTime(92.7004 / 5)).toBe('0:19');
});
