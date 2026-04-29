import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthenticatedRosterSession } from '../../../src/rostering/auth/auth-service.js';
import { InMemoryLeaveRepository } from '../../../src/rostering/leave/leave-service.js';
import { createRosterReportService } from '../../../src/rostering/reports/report-service.js';
import { InMemorySubstituteAssignmentRepository } from '../../../src/rostering/substitute-assignments/substitute-assignment-service.js';
import { InMemoryTimetableRepository } from '../../../src/rostering/timetable/timetable-service.js';

const adminSession: AuthenticatedRosterSession = {
  sessionId: 'session-admin',
  user: { userId: 'user-admin-demo', email: 'admin@schoolroster.test', displayName: 'Admin Demo' },
  activeSchoolId: 'school-steck-demo',
  activeSchoolName: 'Steck Demo School',
  activeRole: 'school_admin',
  availableRoles: ['school_admin'],
  actorByRole: { school_admin: 'admin-demo' },
  startedAt: '2026-05-04T00:00:00.000Z',
  lastSeenAt: '2026-05-04T00:00:00.000Z',
  expiresAt: '2026-05-04T12:00:00.000Z',
  csrfTokenHash: 'hash'
};

test('coverage operations report calculates fill, cancellation, reassignment, and time-to-fill metrics', async () => {
  const timetableRepository = new InMemoryTimetableRepository();
  const leaveRepository = new InMemoryLeaveRepository();
  const substituteAssignmentRepository = new InMemorySubstituteAssignmentRepository();
  await timetableRepository.createClassSession({
    id: 'session-report-ops',
    schoolId: 'school-steck-demo',
    termId: 'term-2026-t1',
    timetableId: 'timetable-report-ops',
    timetablePeriodId: 'period-monday-1',
    subjectId: 'subject-math',
    gradeLevelId: 'p4',
    section: 'A',
    equipmentResourceIds: [],
    assignedTeacherId: 'teacher-demo',
    status: 'published',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z'
  });
  await leaveRepository.createLeaveRequest({
    id: 'leave-report-ops',
    schoolId: 'school-steck-demo',
    teacherId: 'teacher-demo',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    durationType: 'am_half_day',
    leaveType: 'sick',
    coverageRequired: true,
    status: 'approved',
    reviewedBy: 'user-admin-demo',
    reviewedAt: '2026-05-04T09:30:00.000Z',
    createdBy: 'user-teacher-demo',
    requestedAt: '2026-05-04T08:00:00.000Z',
    createdAt: '2026-05-04T08:00:00.000Z',
    updatedAt: '2026-05-04T09:30:00.000Z'
  });
  await leaveRepository.createLeaveImpacts([
    {
      id: 'impact-report-ops',
      schoolId: 'school-steck-demo',
      leaveRequestId: 'leave-report-ops',
      classSessionId: 'session-report-ops',
      impactDate: '2026-05-04',
      coverageRequired: true,
      coverageStatus: 'assigned',
      status: 'active',
      source: 'system_computed',
      warningCodes: [],
      createdAt: '2026-05-04T08:00:00.000Z',
      updatedAt: '2026-05-04T10:00:00.000Z'
    }
  ]);
  await substituteAssignmentRepository.create({
    id: 'assignment-canceled',
    schoolId: 'school-steck-demo',
    leaveRequestId: 'leave-report-ops',
    classSessionId: 'session-report-ops',
    originalTeacherId: 'teacher-demo',
    substituteTeacherId: 'teacher-sub-b',
    assignedBy: 'user-admin-demo',
    assignedAt: '2026-05-04T09:00:00.000Z',
    status: 'canceled',
    canceledAt: '2026-05-04T09:15:00.000Z',
    cancellationReason: 'Teacher became unavailable.'
  });
  await substituteAssignmentRepository.create({
    id: 'assignment-active',
    schoolId: 'school-steck-demo',
    leaveRequestId: 'leave-report-ops',
    classSessionId: 'session-report-ops',
    originalTeacherId: 'teacher-demo',
    substituteTeacherId: 'teacher-sub-c',
    assignedBy: 'user-admin-demo',
    assignedAt: '2026-05-04T10:00:00.000Z',
    status: 'offered'
  });
  const service = createRosterReportService({ timetableRepository, leaveRepository, substituteAssignmentRepository });
  const report = await service.coverageOperations({
    session: adminSession,
    query: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', startDate: '2026-05-01', endDate: '2026-05-31' }
  });

  assert.equal(report.totalRequiredImpacts, 1);
  assert.equal(report.filledImpactCount, 1);
  assert.equal(report.unfilledImpactCount, 0);
  assert.equal(report.canceledAssignmentCount, 1);
  assert.equal(report.reassignmentCount, 1);
  assert.equal(report.averageTimeToFillHours, 2);
  assert.equal(report.fillRate, 1);
});
