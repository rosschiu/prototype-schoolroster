import type { TimetablePeriod } from '../../../../../packages/contracts/src/rostering.js';

export type HalfDayBoundaryConfig = {
  amPeriodIndexes?: number[];
  pmPeriodIndexes?: number[];
  halfDayBoundaryTime?: string;
  requireBoundaryReview?: boolean;
};

export type HalfDayClassification = {
  halfDay: 'am' | 'pm';
  warningCode?: 'PERIOD_OVERLAPS_HALF_DAY_BOUNDARY';
};

function minutesFromTime(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error(`Invalid time value: ${value}`);
  }
  return hour * 60 + minute;
}

export function classifyPeriodHalfDay(period: TimetablePeriod, config: HalfDayBoundaryConfig = {}): HalfDayClassification {
  if (config.amPeriodIndexes?.includes(period.periodIndex)) {
    return { halfDay: 'am' };
  }
  if (config.pmPeriodIndexes?.includes(period.periodIndex)) {
    return { halfDay: 'pm' };
  }
  if (!config.halfDayBoundaryTime) {
    return { halfDay: period.halfDay };
  }

  const start = minutesFromTime(period.startTime);
  const end = minutesFromTime(period.endTime);
  const boundary = minutesFromTime(config.halfDayBoundaryTime);
  if (start < boundary && end > boundary) {
    return {
      halfDay: period.halfDay,
      warningCode: 'PERIOD_OVERLAPS_HALF_DAY_BOUNDARY'
    };
  }
  return { halfDay: start < boundary ? 'am' : 'pm' };
}

export function periodMatchesLeaveDuration({
  period,
  durationType,
  config
}: {
  period: TimetablePeriod;
  durationType: 'full_day' | 'am_half_day' | 'pm_half_day';
  config?: HalfDayBoundaryConfig;
}): { matches: boolean; warningCode?: 'PERIOD_OVERLAPS_HALF_DAY_BOUNDARY' } {
  if (durationType === 'full_day') {
    return { matches: true };
  }
  const classification = classifyPeriodHalfDay(period, config);
  return {
    matches: durationType === 'am_half_day' ? classification.halfDay === 'am' : classification.halfDay === 'pm',
    warningCode: classification.warningCode
  };
}
