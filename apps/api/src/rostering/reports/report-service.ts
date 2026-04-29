import type {
  CoverageOperationsReport,
  LeaveSummaryReport,
  LeaveSummaryReportRow,
  ReportExportType,
  SubstituteAssignment,
  SubstituteHistoryReport,
  WorkloadReport,
  WorkloadReportRow
} from '../../../../../packages/contracts/src/rostering.js';
import type { AuthenticatedRosterSession } from '../auth/auth-service.js';
import type { LeaveRepository, LeaveRequest } from '../leave/leave-service.js';
import type { SubstituteAssignmentRepository } from '../substitute-assignments/substitute-assignment-service.js';
import type { ClassSession, TimetableRepository } from '../timetable/timetable-service.js';
import { TimetableValidationError } from '../timetable/timetable-service.js';

const countedAssignmentStatuses = new Set(['assigned', 'offered', 'acknowledged', 'accepted', 'completed']);

export type ReportQuery = {
  schoolId: string;
  termId?: string;
  teacherId?: string;
  startDate?: string;
  endDate?: string;
};

function assertAdmin(session: AuthenticatedRosterSession, schoolId: string): void {
  if (session.activeRole !== 'school_admin') throw new TimetableValidationError('Only school admins can view roster reports.');
  if (session.activeSchoolId !== schoolId) throw new TimetableValidationError('Cross-school report access is not allowed.');
}

function overlapsDateRange(input: { startDate: string; endDate: string }, query: { startDate?: string; endDate?: string }): boolean {
  if (query.startDate && input.endDate < query.startDate) return false;
  if (query.endDate && input.startDate > query.endDate) return false;
  return true;
}

function activeClassSessions(sessions: ClassSession[]): ClassSession[] {
  return sessions.filter((session) => session.status !== 'cancelled' && session.status !== 'archived');
}

function uniqueTeacherIds(...groups: Array<Array<string | undefined>>): string[] {
  return [...new Set(groups.flat().filter((value): value is string => Boolean(value)))].sort();
}

function sortRowsByTeacher<T extends { teacherId: string }>(rows: T[]): T[] {
  return rows.sort((left, right) => left.teacherId.localeCompare(right.teacherId));
}

export function createRosterReportService(input: {
  timetableRepository: TimetableRepository;
  leaveRepository: LeaveRepository;
  substituteAssignmentRepository: SubstituteAssignmentRepository;
}) {
  async function workload({ session, query }: { session: AuthenticatedRosterSession; query: ReportQuery & { termId: string } }): Promise<WorkloadReport> {
    assertAdmin(session, query.schoolId);
    const sessions = activeClassSessions(await input.timetableRepository.listClassSessions(query.schoolId, query.termId));
    const assignments = (await input.substituteAssignmentRepository.listForSchool(query.schoolId))
      .filter((assignment) => countedAssignmentStatuses.has(assignment.status));
    const teacherIds = uniqueTeacherIds(
      sessions.map((item) => item.assignedTeacherId),
      assignments.map((item) => item.substituteTeacherId)
    );
    const rows: WorkloadReportRow[] = teacherIds.map((teacherId) => {
      const regularSessionCount = sessions.filter((item) => item.assignedTeacherId === teacherId).length;
      const substituteDutyCount = assignments.filter((item) => item.substituteTeacherId === teacherId).length;
      return { teacherId, regularSessionCount, substituteDutyCount, totalWorkloadCount: regularSessionCount + substituteDutyCount };
    });
    return { schoolId: query.schoolId, termId: query.termId, rows: sortRowsByTeacher(rows) };
  }

  async function leaveSummary({ session, query }: { session: AuthenticatedRosterSession; query: ReportQuery }): Promise<LeaveSummaryReport> {
    assertAdmin(session, query.schoolId);
    const rawLeaveRequests = (await input.leaveRepository.listLeaveRequests(query.schoolId, { teacherId: query.teacherId }))
      .filter((request) => overlapsDateRange({ startDate: request.startDate, endDate: request.endDate }, query));
    const leaveRequests = [];
    const impactCountByLeave = new Map<string, number>();
    for (const request of rawLeaveRequests) {
      const impacts = await input.leaveRepository.listLeaveImpacts(request.id);
      if (query.termId && !(await impactsMatchTerm(impacts, query.termId))) continue;
      leaveRequests.push(request);
      impactCountByLeave.set(request.id, impacts.filter((impact) => impact.status === 'active' && impact.coverageRequired).length);
    }
    const rowsByKey = new Map<string, LeaveSummaryReportRow>();
    for (const request of leaveRequests) {
      const key = `${request.teacherId}|${request.leaveType}|${request.durationType}`;
      const existing = rowsByKey.get(key) ?? {
        teacherId: request.teacherId,
        leaveType: request.leaveType,
        durationType: request.durationType,
        requestCount: 0,
        coverageImpactCount: 0
      };
      existing.requestCount += 1;
      existing.coverageImpactCount += impactCountByLeave.get(request.id) ?? 0;
      rowsByKey.set(key, existing);
    }
    return {
      schoolId: query.schoolId,
      termId: query.termId,
      startDate: query.startDate,
      endDate: query.endDate,
      rows: [...rowsByKey.values()].sort((left, right) => left.teacherId.localeCompare(right.teacherId) || left.leaveType.localeCompare(right.leaveType))
    };
  }

  async function substituteHistory({ session, query }: { session: AuthenticatedRosterSession; query: ReportQuery }): Promise<SubstituteHistoryReport> {
    assertAdmin(session, query.schoolId);
    const assignments = await input.substituteAssignmentRepository.listForSchool(query.schoolId);
    const leaveById = new Map<string, LeaveRequest>();
    const rows = [];
    for (const assignment of assignments) {
      const leave = leaveById.get(assignment.leaveRequestId) ?? await input.leaveRepository.getLeaveRequest(assignment.leaveRequestId);
      if (leave) leaveById.set(assignment.leaveRequestId, leave);
      if (query.termId) {
        const classSession = await input.timetableRepository.getClassSession(assignment.classSessionId);
        if (classSession?.termId !== query.termId) continue;
      }
      if (query.teacherId && assignment.originalTeacherId !== query.teacherId && assignment.substituteTeacherId !== query.teacherId) continue;
      const dateRange = leave ? { startDate: leave.startDate, endDate: leave.endDate } : { startDate: assignment.assignedAt.slice(0, 10), endDate: assignment.assignedAt.slice(0, 10) };
      if (!overlapsDateRange(dateRange, query)) continue;
      rows.push(toHistoryRow(assignment, leave ?? undefined));
    }
    return {
      schoolId: query.schoolId,
      termId: query.termId,
      teacherId: query.teacherId,
      startDate: query.startDate,
      endDate: query.endDate,
      rows: rows.sort((left, right) => right.assignedAt.localeCompare(left.assignedAt) || left.assignmentId.localeCompare(right.assignmentId))
    };
  }

  async function coverageOperations({ session, query }: { session: AuthenticatedRosterSession; query: ReportQuery }): Promise<CoverageOperationsReport> {
    assertAdmin(session, query.schoolId);
    const leaveRequests = (await input.leaveRepository.listLeaveRequests(query.schoolId, { teacherId: query.teacherId }))
      .filter((request) => overlapsDateRange({ startDate: request.startDate, endDate: request.endDate }, query));
    let totalRequiredImpacts = 0;
    let filledImpactCount = 0;
    let unfilledImpactCount = 0;
    let noCoverageNeededCount = 0;
    const fillDurationsHours: number[] = [];
    const includedLeaveIds = new Set<string>();
    for (const request of leaveRequests) {
      const impacts = await input.leaveRepository.listLeaveImpacts(request.id);
      if (query.termId && !(await impactsMatchTerm(impacts, query.termId))) continue;
      includedLeaveIds.add(request.id);
      for (const impact of impacts.filter((item) => item.status === 'active')) {
        if (impact.coverageStatus === 'no_coverage_needed') noCoverageNeededCount += 1;
        if (!impact.coverageRequired) continue;
        totalRequiredImpacts += 1;
        if (impact.coverageStatus === 'unfilled') unfilledImpactCount += 1;
        if (impact.coverageStatus === 'assigned' || impact.coverageStatus === 'covered') filledImpactCount += 1;
      }
      const assignments = (await input.substituteAssignmentRepository.listForLeave(request.id))
        .filter((assignment) => !query.teacherId || assignment.originalTeacherId === query.teacherId || assignment.substituteTeacherId === query.teacherId);
      for (const assignment of assignments.filter((item) => countedAssignmentStatuses.has(item.status))) {
        const assigned = Date.parse(assignment.assignedAt);
        const requested = Date.parse(request.requestedAt);
        if (Number.isFinite(assigned) && Number.isFinite(requested) && assigned >= requested) {
          fillDurationsHours.push((assigned - requested) / 36e5);
        }
      }
    }
    const assignments = (await input.substituteAssignmentRepository.listForSchool(query.schoolId))
      .filter((assignment) => includedLeaveIds.has(assignment.leaveRequestId));
    const canceledAssignmentCount = assignments.filter((assignment) => assignment.status === 'canceled').length;
    const assignmentGroups = new Map<string, number>();
    for (const assignment of assignments) {
      const key = `${assignment.leaveRequestId}|${assignment.classSessionId}`;
      assignmentGroups.set(key, (assignmentGroups.get(key) ?? 0) + 1);
    }
    const reassignmentCount = [...assignmentGroups.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
    return {
      schoolId: query.schoolId,
      termId: query.termId,
      startDate: query.startDate,
      endDate: query.endDate,
      totalRequiredImpacts,
      filledImpactCount,
      unfilledImpactCount,
      noCoverageNeededCount,
      canceledAssignmentCount,
      reassignmentCount,
      averageTimeToFillHours: fillDurationsHours.length ? Number((fillDurationsHours.reduce((sum, value) => sum + value, 0) / fillDurationsHours.length).toFixed(2)) : null,
      fillRate: totalRequiredImpacts ? Number((filledImpactCount / totalRequiredImpacts).toFixed(4)) : 0
    };
  }

  async function exportCsv({ session, type, query }: { session: AuthenticatedRosterSession; type: ReportExportType; query: ReportQuery }): Promise<string> {
    if (type === 'workload') {
      return csv([
        ['Teacher ID', 'Regular Sessions', 'Substitute Duties', 'Total Workload'],
        ...(await workload({ session, query: { ...query, termId: requireTerm(query.termId) } })).rows.map((row) => [row.teacherId, row.regularSessionCount, row.substituteDutyCount, row.totalWorkloadCount])
      ]);
    }
    if (type === 'leave-summary') {
      return csv([
        ['Teacher ID', 'Leave Type', 'Duration', 'Requests', 'Coverage Impacts'],
        ...(await leaveSummary({ session, query })).rows.map((row) => [row.teacherId, row.leaveType, row.durationType, row.requestCount, row.coverageImpactCount])
      ]);
    }
    if (type === 'substitute-history') {
      return csv([
        ['Assignment ID', 'Original Teacher ID', 'Substitute Teacher ID', 'Status', 'Assigned At', 'Leave Type', 'Leave Start', 'Leave End'],
        ...(await substituteHistory({ session, query })).rows.map((row) => [row.assignmentId, row.originalTeacherId, row.substituteTeacherId, row.status, row.assignedAt, row.leaveType ?? '', row.leaveStartDate ?? '', row.leaveEndDate ?? ''])
      ]);
    }
    return csv([
      ['Metric', 'Value'],
      ...Object.entries(await coverageOperations({ session, query }))
        .filter(([key]) => !['schoolId', 'termId', 'startDate', 'endDate'].includes(key))
        .map(([key, value]) => [key, value ?? ''])
    ]);
  }

  return { workload, leaveSummary, substituteHistory, coverageOperations, exportCsv };

  async function impactsMatchTerm(impacts: Awaited<ReturnType<LeaveRepository['listLeaveImpacts']>>, termId: string): Promise<boolean> {
    for (const impact of impacts) {
      const classSession = await input.timetableRepository.getClassSession(impact.classSessionId);
      if (classSession?.termId === termId) return true;
    }
    return false;
  }
}

function requireTerm(termId?: string): string {
  if (!termId) throw new TimetableValidationError('termId is required.');
  return termId;
}

function csv(rows: Array<Array<string | number>>): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toHistoryRow(assignment: SubstituteAssignment, leave?: LeaveRequest): SubstituteHistoryReport['rows'][number] {
  return {
    assignmentId: assignment.id,
    leaveRequestId: assignment.leaveRequestId,
    classSessionId: assignment.classSessionId,
    originalTeacherId: assignment.originalTeacherId,
    substituteTeacherId: assignment.substituteTeacherId,
    status: assignment.status,
    assignedAt: assignment.assignedAt,
    acceptedAt: assignment.acceptedAt,
    declinedAt: assignment.declinedAt,
    completedAt: assignment.completedAt,
    canceledAt: assignment.canceledAt,
    cancellationReason: assignment.cancellationReason,
    leaveType: leave?.leaveType,
    leaveStartDate: leave?.startDate,
    leaveEndDate: leave?.endDate
  };
}
