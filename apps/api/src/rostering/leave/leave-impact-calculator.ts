import type { ClassSession, TimetableRepository } from '../timetable/timetable-service.js';
import type { CalendarService } from '../calendar/calendar-service.js';
import type { HalfDayBoundaryConfig } from '../calendar/half-day-config.js';
import { periodMatchesLeaveDuration } from '../calendar/half-day-config.js';
import type { TimetablePeriod } from '../../../../../packages/contracts/src/rostering.js';

export type LeaveDurationType = 'full_day' | 'am_half_day' | 'pm_half_day';
export type LeaveImpactWarningCode = 'PERIOD_OVERLAPS_HALF_DAY_BOUNDARY';

export type CalculatedLeaveImpact = {
  classSession: ClassSession;
  period: TimetablePeriod;
  impactDate: string;
  warningCodes: LeaveImpactWarningCode[];
};

export type LeaveImpactCalculationResult = {
  impacts: CalculatedLeaveImpact[];
  warnings: Array<{ code: LeaveImpactWarningCode; classSessionId: string; timetablePeriodId: string; impactDate: string }>;
};

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || dateKey(date) !== value) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

export function eachDateInclusive(startDate: string, endDate: string): string[] {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (start > end) {
    throw new Error('startDate must be on or before endDate.');
  }
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(dateKey(cursor));
  }
  return dates;
}

export function dayIndexForDate(date: string): number {
  const day = parseDateOnly(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export async function calculateLeaveImpacts({
  repository,
  calendarService,
  schoolId,
  termId,
  teacherId,
  startDate,
  endDate,
  durationType,
  halfDayConfig
}: {
  repository: Pick<TimetableRepository, 'listTimetables' | 'listPeriods' | 'listClassSessions'>;
  calendarService?: Pick<CalendarService, 'isNoSchoolDate' | 'getExceptionForDate'>;
  schoolId: string;
  termId: string;
  teacherId: string;
  startDate: string;
  endDate: string;
  durationType: LeaveDurationType;
  halfDayConfig?: HalfDayBoundaryConfig;
}): Promise<LeaveImpactCalculationResult> {
  const timetables = await repository.listTimetables(schoolId, termId);
  const periodsById = new Map<string, TimetablePeriod>();
  for (const timetable of timetables) {
    for (const period of await repository.listPeriods(timetable.id)) {
      periodsById.set(period.id, period);
    }
  }
  const sessions = (await repository.listClassSessions(schoolId, termId)).filter(
    (session) => session.assignedTeacherId === teacherId && session.status === 'published'
  );
  const impacts: CalculatedLeaveImpact[] = [];
  const warnings: LeaveImpactCalculationResult['warnings'] = [];

  for (const date of eachDateInclusive(startDate, endDate)) {
    if (await calendarService?.isNoSchoolDate({ schoolId, termId, date })) {
      continue;
    }
    const exception = await calendarService?.getExceptionForDate({ schoolId, termId, date });
    const effectiveDayIndex = exception?.exceptionType === 'replacement_day' && exception.replacementDayIndex
      ? exception.replacementDayIndex
      : dayIndexForDate(date);

    for (const session of sessions) {
      const period = periodsById.get(session.timetablePeriodId);
      if (!period || period.dayIndex !== effectiveDayIndex) {
        continue;
      }
      const match = periodMatchesLeaveDuration({ period, durationType, config: halfDayConfig });
      if (!match.matches) {
        continue;
      }
      const warningCodes = match.warningCode ? [match.warningCode] : [];
      impacts.push({ classSession: session, period, impactDate: date, warningCodes });
      if (match.warningCode) {
        warnings.push({ code: match.warningCode, classSessionId: session.id, timetablePeriodId: period.id, impactDate: date });
      }
    }
  }

  const seen = new Set<string>();
  return {
    impacts: impacts.filter((impact) => {
      const key = `${impact.classSession.id}:${impact.impactDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
    warnings
  };
}
