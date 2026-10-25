import { expect, it } from 'vitest';
import { launchSpread } from '../tools/spread';

// The first M0 table sent 89% of launches down the left wall and touched a part only 6% of the time.
it('launches land all over the table instead of funnelling down one wall', () => {
  const r = launchSpread(250);
  expect(r.weak).toBe(0);
  expect(r.busiest).toBeLessThan(0.4);
  expect(r.histo.filter((h) => h >= 0.05).length).toBeGreaterThanOrEqual(5);
  expect(r.touched).toBeGreaterThan(0.5);
});
