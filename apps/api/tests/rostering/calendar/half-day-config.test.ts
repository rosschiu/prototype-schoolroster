import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TimetablePeriod } from '../../../../../packages/contracts/src/rostering.js';
import { classifyPeriodHalfDay, periodMatchesLeaveDuration } from '../../../src/rostering/calendar/half-day-config.js';

function period(overrides: Partial<TimetablePeriod>): TimetablePeriod {
  return {
    id: 'period-test',
    timetableId: 'timetable-test',
    schoolId: 'school-steck-demo',
    dayIndex: 1,
    periodIndex: 1,
    label: 'P1',
    startTime: '08:30',
    endTime: '09:10',
    halfDay: 'am',
    sortOrder: 1,
    isTeachingPeriod: true,
    ...overrides
  };
}

test('explicit AM/PM period grouping overrides period halfDay values', () => {
  const result = classifyPeriodHalfDay(period({ periodIndex: 5, halfDay: 'am' }), {
    amPeriodIndexes: [1, 2, 3, 4],
    pmPeriodIndexes: [5, 6, 7, 8]
  });

  assert.equal(result.halfDay, 'pm');
});

test('boundary time fallback classifies periods and warns on overlap', () => {
  assert.equal(classifyPeriodHalfDay(period({ startTime: '11:00', endTime: '11:40' }), { halfDayBoundaryTime: '12:00' }).halfDay, 'am');
  assert.equal(classifyPeriodHalfDay(period({ startTime: '13:00', endTime: '13:40' }), { halfDayBoundaryTime: '12:00' }).halfDay, 'pm');

  const overlap = periodMatchesLeaveDuration({
    period: period({ startTime: '11:45', endTime: '12:15', halfDay: 'am' }),
    durationType: 'am_half_day',
    config: { halfDayBoundaryTime: '12:00', requireBoundaryReview: true }
  });
  assert.equal(overlap.matches, true);
  assert.equal(overlap.warningCode, 'PERIOD_OVERLAPS_HALF_DAY_BOUNDARY');
});
