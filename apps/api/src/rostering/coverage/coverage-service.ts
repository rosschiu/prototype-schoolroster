import type { UnfilledCoverageQueueItem } from '../../../../../packages/contracts/src/rostering.js';
import type { AuthenticatedRosterSession } from '../auth/auth-service.js';
import type { LeaveRepository } from '../leave/leave-service.js';
import type { TimetableRepository } from '../timetable/timetable-service.js';
import { TimetableValidationError } from '../timetable/timetable-service.js';

function assertAdmin(session: AuthenticatedRosterSession, schoolId: string): void {
  if (session.activeSchoolId !== schoolId) {
    throw new TimetableValidationError('Cross-school coverage queue access is not allowed.');
  }
  if (session.activeRole !== 'school_admin') {
    throw new TimetableValidationError('Only school admins can view unfilled coverage.');
  }
}

export function createCoverageService(input: {
  leaveRepository: LeaveRepository;
  timetableRepository: TimetableRepository;
}) {
  return {
    async listUnfilled(request: {
      session: AuthenticatedRosterSession;
      schoolId: string;
      termId?: string;
      teacherId?: string;
      date?: string;
    }): Promise<{ items: UnfilledCoverageQueueItem[] }> {
      assertAdmin(request.session, request.schoolId);
      const leaveRequests = await input.leaveRepository.listLeaveRequests(request.schoolId, {
        teacherId: request.teacherId
      });
      const items: UnfilledCoverageQueueItem[] = [];
      for (const leaveRequest of leaveRequests) {
        const impacts = await input.leaveRepository.listLeaveImpacts(leaveRequest.id);
        for (const impact of impacts) {
          if (!impact.coverageRequired || impact.status !== 'active' || impact.coverageStatus !== 'unfilled') continue;
          if (request.date && impact.impactDate !== request.date) continue;
          const classSession = await input.timetableRepository.getClassSession(impact.classSessionId);
          if (request.termId && classSession?.termId !== request.termId) continue;
          items.push({
            leaveRequest,
            impact,
            classSession: classSession ?? undefined
          });
        }
      }
      items.sort((a, b) => `${a.impact.impactDate}:${a.impact.classSessionId}`.localeCompare(`${b.impact.impactDate}:${b.impact.classSessionId}`));
      return { items };
    }
  };
}
