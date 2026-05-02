import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SchedulePlannerPage } from '../../src/routes/rostering/SchedulePlannerPage.js';
import {
  createDemoSchedulePlannerApi,
  createRosterSchedulePlannerApi,
  toCreateClassSessionRequest,
  type SchedulePlannerApi
} from '../../src/features/rostering/schedule/schedulePlannerApi.js';
import { createDefaultTimetable, createDemoSession } from '../../src/features/rostering/schedule/mockRosterData.js';
import { createRosterLeaveApi, type LeaveApi } from '../../src/features/rostering/leave/leaveApi.js';
import type { CoverageApi } from '../../src/features/rostering/coverage/coverageApi.js';
import type { SubstituteAssignmentsApi } from '../../src/features/rostering/substitute/substituteAssignmentsApi.js';
import { createRosterSubstituteRecommendationApi, type SubstituteRecommendationApi } from '../../src/features/rostering/substitute/substituteRecommendationApi.js';
import type { SubstituteAssignment, SubstituteRecommendation, UnfilledCoverageQueueItem } from '../../../../packages/contracts/src/rostering.js';

function recommendation(input: Partial<SubstituteRecommendation>): SubstituteRecommendation {
  return {
    teacher_id: input.teacher_id ?? 'teacher-wong',
    teacher_name: input.teacher_name ?? 'Ms. Wong',
    composite_score: input.composite_score ?? 0.91,
    rank: input.rank ?? 1,
    is_feasible: true,
    breakdown: {
      workload_balance: { score: 0.9, weight: 0.3, contribution: 0.27, detail: 'Low workload' },
      subject_competency: { score: 1, weight: 0.35, contribution: 0.35, detail: 'Primary subject competency' },
      class_familiarity: { score: 0.7, weight: 0.2, contribution: 0.14, detail: 'Known class' },
      recency_penalty: { score: 1, weight: 0.15, contribution: 0.15, detail: 'Never substituted' },
      preference_policy: { score: 0.5, weight: 0, contribution: 0, detail: 'No matching preference rules', rule_ids: [] },
      ...input.breakdown
    },
    raw_inputs: {
      term_sub_units: 0,
      week_sub_units: 0,
      capacity_factor: 1,
      raw_workload: 0,
      competency_level: 'primary',
      grade_multiplier: 1,
      credential_bonus: 0,
      credential_penalty: 0,
      days_since_last_sub: null,
      familiarity_signals: { exact_signal: 0, section_signal: 0, subject_grade_signal: 0 },
      preference_rule_ids: [],
      ...input.raw_inputs
    },
    reason_codes: input.reason_codes ?? ['LOW_WORKLOAD', 'PRIMARY_SUBJECT_MATCH']
  };
}

function substituteAssignment(input: Partial<SubstituteAssignment>): SubstituteAssignment {
  return {
    id: input.id ?? 'assignment-1',
    schoolId: input.schoolId ?? 'school-steck-demo',
    leaveRequestId: input.leaveRequestId ?? 'leave-1',
    classSessionId: input.classSessionId ?? 'session-1',
    originalTeacherId: input.originalTeacherId ?? 'teacher-demo',
    substituteTeacherId: input.substituteTeacherId ?? 'teacher-sub-b',
    assignedBy: input.assignedBy ?? 'user-admin-demo',
    assignedAt: input.assignedAt ?? '2026-04-28T00:00:00.000Z',
    status: input.status ?? 'offered',
    acceptedAt: input.acceptedAt,
    declinedAt: input.declinedAt
  };
}

function coverageQueueItem(input: Partial<UnfilledCoverageQueueItem>): UnfilledCoverageQueueItem {
  return {
    leaveRequest: {
      id: 'leave-coverage-1',
      schoolId: 'school-steck-demo',
      teacherId: 'teacher-demo',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      durationType: 'am_half_day',
      leaveType: 'sick',
      reason: 'Sick leave',
      coverageRequired: true,
      createdBy: 'user-teacher-demo',
      requestedAt: '2026-04-29T00:00:00.000Z',
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
      status: 'pending',
      ...input.leaveRequest
    },
    impact: {
      id: 'impact-coverage-1',
      schoolId: 'school-steck-demo',
      leaveRequestId: 'leave-coverage-1',
      classSessionId: 'session-1',
      impactDate: '2026-05-04',
      coverageRequired: true,
      coverageStatus: 'unfilled',
      status: 'active',
      source: 'system_computed',
      warningCodes: [],
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
      ...input.impact
    },
    classSession: input.classSession
  };
}

async function confirmTimetableStructure() {
  const confirmButton = await screen.findByRole('button', { name: /confirm structure/i });
  await waitFor(() => expect(confirmButton).not.toBeDisabled());
  fireEvent.click(confirmButton);
  await waitFor(() => expect(screen.getByLabelText('Timetable setup')).toHaveTextContent('Confirmed'));
}

describe('SchedulePlannerPage', () => {
  it('starts from default template and shows admin overview metrics', async () => {
    render(<SchedulePlannerPage api={createDemoSchedulePlannerApi()} leaveApi={null} />);

    expect(screen.getByLabelText('Timetable grid empty')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));

    expect(await screen.findByText('Default timetable created.')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('20 AM / 20 PM')).toBeInTheDocument();
    expect(screen.getByLabelText('Timetable grid')).toBeInTheDocument();
  });

  it('requires timetable setup confirmation and excludes non-teaching periods from session entry', async () => {
    render(<SchedulePlannerPage api={createDemoSchedulePlannerApi()} leaveApi={null} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));
    await screen.findByText('Default timetable created.');

    expect(screen.getByLabelText('Session form')).toHaveTextContent('Confirm the timetable structure before adding class sessions.');
    fireEvent.click((await screen.findAllByLabelText('P1 teaching period'))[0]);
    fireEvent.click(screen.getByRole('button', { name: /save timetable structure/i }));
    expect(await screen.findByText('Timetable structure saved.')).toBeInTheDocument();
    await confirmTimetableStructure();

    const periodSelect = screen.getByLabelText('Period');
    expect(within(periodSelect).queryByText(/Day 1 P1/)).not.toBeInTheDocument();
    expect(within(periodSelect).getByText(/Day 1 P2/)).toBeInTheDocument();
  });

  it('creates a session, shows it in the grid, and enables publishing', async () => {
    render(<SchedulePlannerPage api={createDemoSchedulePlannerApi()} leaveApi={null} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));
    await screen.findByText('Default timetable created.');
    await confirmTimetableStructure();

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-1' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Math' } });
    fireEvent.change(screen.getByLabelText('Class section'), { target: { value: 'P4A' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-101' } });
    fireEvent.click(screen.getByLabelText('Projector A'));
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));

    expect(await screen.findByText('Session added to draft timetable.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Math.*P4.*A/s })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish schedule/i })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /publish schedule/i }));
    expect(await screen.findByText(/Schedule published/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unpublish draft/i })).toBeInTheDocument();
  });

  it('surfaces teacher conflict warnings in the assignment dropdown and inline validation', async () => {
    render(<SchedulePlannerPage api={createDemoSchedulePlannerApi()} leaveApi={null} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));
    await screen.findByText('Default timetable created.');
    await confirmTimetableStructure();

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-1' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-101' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-1' } });
    expect(screen.getByText(/Ms. Chan already teaches P4A in this period/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-102' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));

    expect(screen.getByText('This teacher is already assigned to a session at this time.')).toBeInTheDocument();
  });

  it('renders generated class, teacher, room, and equipment projections', async () => {
    render(<SchedulePlannerPage api={createDemoSchedulePlannerApi()} leaveApi={null} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));
    await screen.findByText('Default timetable created.');
    await confirmTimetableStructure();
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-1' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-101' } });
    fireEvent.click(screen.getByLabelText('Projector A'));
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    const projectionPanel = screen.getByLabelText('Generated schedule projections');
    expect(within(projectionPanel).getByText('Math · P4A')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Projection type'), { target: { value: 'teacher' } });
    fireEvent.change(screen.getByLabelText('Projection owner'), { target: { value: 'teacher-demo' } });
    expect(within(projectionPanel).getByText('Math · P4A')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Projection type'), { target: { value: 'room' } });
    fireEvent.change(screen.getByLabelText('Projection owner'), { target: { value: 'room-101' } });
    expect(within(projectionPanel).getByText('Math · P4A')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Projection type'), { target: { value: 'equipment' } });
    fireEvent.change(screen.getByLabelText('Projection owner'), { target: { value: 'projector-1' } });
    expect(within(projectionPanel).getByText('Math · P4A')).toBeInTheDocument();
  });

  it('uses an API seam with contract-shaped timetable, session, and publish payloads', async () => {
    const demoApi = createDemoSchedulePlannerApi();
    const api: SchedulePlannerApi = {
      ...demoApi,
      createDefaultTimetable: vi.fn(async () => createDefaultTimetable()),
      createSession: vi.fn(async (input) => demoApi.createSession(input)),
      updateSession: vi.fn(async (input) => demoApi.updateSession(input)),
      publishTimetable: vi.fn(async (input) => demoApi.publishTimetable(input)),
      unpublishTimetable: vi.fn(async (input) => demoApi.unpublishTimetable(input))
    };

    render(<SchedulePlannerPage api={api} leaveApi={null} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));
    await screen.findByText('Default timetable created.');
    await confirmTimetableStructure();

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-1' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Science' } });
    fireEvent.change(screen.getByLabelText('Class section'), { target: { value: 'P5B' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-wong' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'lab-1' } });
    fireEvent.click(screen.getByLabelText('Science cart'));
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    expect(api.createDefaultTimetable).toHaveBeenCalledTimes(1);
    expect(api.createSession).toHaveBeenCalledTimes(1);
    const createInput = vi.mocked(api.createSession).mock.calls[0][0];
    expect(toCreateClassSessionRequest(createInput)).toMatchObject({
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      timetableId: 'timetable-demo',
      timetablePeriodId: 'period-1-1',
      subjectId: 'Science',
      gradeLevelId: 'P5',
      section: 'B',
      roomId: 'lab-1',
      assignedTeacherId: 'teacher-wong',
      equipmentResourceIds: ['science-cart'],
      status: 'draft'
    });

    fireEvent.click(screen.getByRole('button', { name: /publish schedule/i }));
    await waitFor(() => expect(api.publishTimetable).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Schedule published/)).toBeInTheDocument();
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0);
  });

  it('hydrates persisted sessions returned by the real schedule API seam', async () => {
    const { timetable, periods } = createDefaultTimetable();
    const persisted = createDemoSession({
      id: 'persisted-session-1',
      timetable: { ...timetable, status: 'published', publishedAt: '2026-04-27T00:00:00.000Z' },
      period: periods[0],
      subjectId: 'Math',
      gradeLevelId: 'P4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo'
    });
    const api: SchedulePlannerApi = {
      ...createDemoSchedulePlannerApi(),
      createDefaultTimetable: vi.fn(async () => ({
        timetable: { ...timetable, status: 'published' as const, publishedAt: '2026-04-27T00:00:00.000Z' },
        periods,
        sessions: [{ ...persisted, status: 'published' as const }]
      }))
    };

    render(<SchedulePlannerPage api={api} leaveApi={null} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));

    expect(await screen.findByRole('button', { name: /Math.*P4.*A/s })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unpublish draft/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Impacted sessions preview')).toHaveTextContent('Math · P4A');
  });

  it('lets a teacher preview and submit AM half-day leave, then see status', async () => {
    render(<SchedulePlannerPage api={createDemoSchedulePlannerApi()} leaveApi={null} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));
    await screen.findByText('Default timetable created.');
    await confirmTimetableStructure();

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-1' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Math' } });
    fireEvent.change(screen.getByLabelText('Class section'), { target: { value: 'P4A' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-101' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-5' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Science' } });
    fireEvent.change(screen.getByLabelText('Class section'), { target: { value: 'P4B' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-102' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    fireEvent.change(screen.getByLabelText('Leave duration'), { target: { value: 'am_half_day' } });
    const preview = screen.getByLabelText('Impacted sessions preview');
    expect(within(preview).getByText(/Math · P4A/)).toBeInTheDocument();
    expect(within(preview).queryByText(/Science · P4B/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Leave reason'), { target: { value: 'Morning appointment' } });
    fireEvent.click(screen.getByRole('button', { name: /submit leave request/i }));

    expect(await screen.findByText('Leave request submitted.')).toBeInTheDocument();
    expect(screen.getByLabelText('Teacher leave status')).toHaveTextContent('AM half day');
    expect(screen.getByLabelText('Teacher leave status')).toHaveTextContent('Pending');
    expect(screen.getByLabelText('Notification log')).toHaveTextContent('leave.applied');
  });

  it('lets admin correct impacted sessions with a reason and approve leave', async () => {
    render(<SchedulePlannerPage api={createDemoSchedulePlannerApi()} leaveApi={null} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));
    await screen.findByText('Default timetable created.');
    await confirmTimetableStructure();

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-1' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Math' } });
    fireEvent.change(screen.getByLabelText('Class section'), { target: { value: 'P4A' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-101' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-5' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Science' } });
    fireEvent.change(screen.getByLabelText('Class section'), { target: { value: 'P4B' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-102' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-1' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'PE' } });
    fireEvent.change(screen.getByLabelText('Class section'), { target: { value: 'P5A' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-lee' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-102' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    fireEvent.change(screen.getByLabelText('Leave duration'), { target: { value: 'am_half_day' } });
    fireEvent.click(screen.getByRole('button', { name: /submit leave request/i }));
    await screen.findByText('Leave request submitted.');

    fireEvent.change(screen.getByLabelText('Adjustment reason'), { target: { value: 'PM lesson also needs coverage' } });
    fireEvent.change(screen.getByLabelText('Add impacted session'), { target: { value: 'session-2' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(await screen.findByText('Impact added.')).toBeInTheDocument();
    expect(screen.getByLabelText('Admin impacted sessions')).toHaveTextContent('Science · P4B');

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(await screen.findByText('Leave approved.')).toBeInTheDocument();
    expect(screen.getByLabelText('Teacher leave status')).toHaveTextContent('Approved');
    expect(screen.getByLabelText('Notification log')).toHaveTextContent('leave.approved');
  });

  it('loads substitute recommendations for impacted sessions and lets admin select a candidate', async () => {
    const recommendationApi: SubstituteRecommendationApi = {
      recommend: vi.fn(async () => ({
        job_id: 'job-1',
        status: 'running' as const,
        current_step: 'scoring_candidates',
        progress: 0.5,
        recommendations: [],
        reason_codes: []
      })),
      getJob: vi.fn(async () => ({
        job: {
          job_id: 'job-1',
          status: 'completed' as const,
          current_step: 'completed',
          progress: 1,
          school_id: 'school-steck-demo',
          leave_id: 'leave-1',
          session_id: 'session-1',
          created_at: '2026-04-28T00:00:00.000Z',
          updated_at: '2026-04-28T00:00:00.000Z',
          result: {
            recommendations: [
              recommendation({ teacher_id: 'teacher-wong', teacher_name: 'Ms. Wong', composite_score: 0.91, rank: 1 }),
              recommendation({ teacher_id: 'teacher-lam', teacher_name: 'Mr. Lam', composite_score: 0.78, rank: 2, reason_codes: ['LOW_WORKLOAD'] })
            ],
            reason_codes: []
          }
        }
      })),
      createOffer: vi.fn(async () => ({
        assignment: {
          id: 'assignment-1',
          schoolId: 'school-steck-demo',
          leaveRequestId: 'leave-1',
          classSessionId: 'session-1',
          originalTeacherId: 'teacher-demo',
          substituteTeacherId: 'teacher-wong',
          assignedBy: 'user-admin-demo',
          assignedAt: '2026-04-28T00:00:00.000Z',
          status: 'offered' as const
        },
        assignments: []
      }))
    };

    render(<SchedulePlannerPage api={createDemoSchedulePlannerApi()} leaveApi={null} substituteRecommendationApi={recommendationApi} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));
    await screen.findByText('Default timetable created.');
    await confirmTimetableStructure();

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-1' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Math' } });
    fireEvent.change(screen.getByLabelText('Class section'), { target: { value: 'P4A' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-101' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    fireEvent.change(screen.getByLabelText('Leave duration'), { target: { value: 'am_half_day' } });
    fireEvent.click(screen.getByRole('button', { name: /submit leave request/i }));
    await screen.findByText('Leave request submitted.');

    fireEvent.click(screen.getByRole('button', { name: /get recommendations/i }));

    await waitFor(() => expect(recommendationApi.recommend).toHaveBeenCalledWith({
      leaveId: 'leave-1',
      sessionId: 'session-1',
      asyncMode: true
    }));
    await waitFor(() => expect(recommendationApi.getJob).toHaveBeenCalledWith('job-1'));
    const ranked = await screen.findByLabelText('Ranked substitute candidates');
    expect(within(ranked).getByText(/#1 Ms. Wong/)).toBeInTheDocument();
    expect(within(ranked).getByText('91% match')).toBeInTheDocument();
    expect(within(ranked).getByText(/PRIMARY_SUBJECT_MATCH/)).toBeInTheDocument();
    fireEvent.click(within(ranked).getAllByRole('button', { name: /view breakdown/i })[0]);
    const breakdown = screen.getByLabelText('Score breakdown for Ms. Wong');
    expect(within(breakdown).getByText('Composite score')).toBeInTheDocument();
    expect(within(breakdown).getByText('Workload balance')).toBeInTheDocument();
    expect(within(breakdown).getByText('Low workload')).toBeInTheDocument();
    expect(within(breakdown).getByText('Subject competency')).toBeInTheDocument();
    expect(within(breakdown).getByText('adds 0.35')).toBeInTheDocument();
    expect(within(breakdown).getByText('Competency primary')).toBeInTheDocument();

    fireEvent.click(within(ranked).getAllByRole('button', { name: /select/i })[0]);
    expect(await screen.findByText('Ms. Wong selected for coverage.')).toBeInTheDocument();
    expect(within(ranked).getByRole('button', { name: 'Selected' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /send substitute offer/i }));
    await waitFor(() => expect(recommendationApi.createOffer).toHaveBeenCalledWith({
      leaveId: 'leave-1',
      sessionId: 'session-1',
      substituteTeacherId: 'teacher-wong'
    }));
    expect(await screen.findByText('Substitute offer sent to Ms. Wong.')).toBeInTheDocument();
    expect(screen.getByLabelText('Admin impacted sessions')).toHaveTextContent('assigned');
    expect(screen.getByLabelText('Notification log')).toHaveTextContent('substitute.offered');

    fireEvent.change(screen.getByLabelText('Manual substitute search'), { target: { value: 'Chan' } });
    const manualOptions = screen.getByLabelText('Manual substitute options');
    expect(within(manualOptions).getByText('Ms. Chan')).toBeInTheDocument();
    expect(within(manualOptions).getByText('Unavailable - original teacher on leave')).toBeInTheDocument();
    fireEvent.click(within(manualOptions).getByRole('button', { name: /choose override/i }));
    expect(screen.getByText(/Confirm manual override for Ms. Chan/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm manual override/i }));
    expect(await screen.findByText('Ms. Chan manually selected for coverage.')).toBeInTheDocument();
    expect(screen.getByLabelText('Notification log')).toHaveTextContent('substitute.override.selected');
    expect(screen.getByLabelText('Notification log')).toHaveTextContent('Manual override audited for Ms. Chan');
  });

  it('lets admin create a leave record for a teacher with an audit reason', async () => {
    render(<SchedulePlannerPage api={createDemoSchedulePlannerApi()} leaveApi={null} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));
    await screen.findByText('Default timetable created.');
    await confirmTimetableStructure();

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-5' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Science' } });
    fireEvent.change(screen.getByLabelText('Class section'), { target: { value: 'P4B' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-102' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    fireEvent.change(screen.getByLabelText('Leave duration'), { target: { value: 'pm_half_day' } });
    fireEvent.change(screen.getByLabelText('Admin create reason'), { target: { value: 'Teacher phoned the office' } });
    fireEvent.click(screen.getByRole('button', { name: /create leave as admin/i }));

    expect(await screen.findByText('Admin-created leave recorded.')).toBeInTheDocument();
    expect(screen.getByLabelText('Teacher leave status')).toHaveTextContent('PM half day');
    expect(screen.getByLabelText('Teacher leave status')).toHaveTextContent('Created by admin');
    expect(screen.getByLabelText('Admin leave management')).toHaveTextContent('Science · P4B');
  });

  it('shows teacher substitute offers and lets teacher accept or decline', async () => {
    const substituteAssignmentsApi: SubstituteAssignmentsApi = {
      list: vi.fn(async () => ({
        assignments: [
          substituteAssignment({ id: 'assignment-1', classSessionId: 'session-1', status: 'offered' }),
          substituteAssignment({ id: 'assignment-2', classSessionId: 'session-1', status: 'offered' })
        ]
      })),
      respond: vi.fn(async (input) => ({
        assignment: substituteAssignment({
          id: input.assignmentId,
          classSessionId: 'session-1',
          status: input.status,
          acceptedAt: input.status === 'accepted' ? '2026-04-29T00:00:00.000Z' : undefined,
          declinedAt: input.status === 'declined' ? '2026-04-29T00:00:00.000Z' : undefined
        })
      }))
    };
    render(<SchedulePlannerPage api={createDemoSchedulePlannerApi()} leaveApi={null} substituteAssignmentsApi={substituteAssignmentsApi} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));
    await screen.findByText('Default timetable created.');
    await confirmTimetableStructure();

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-1' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Math' } });
    fireEvent.change(screen.getByLabelText('Class section'), { target: { value: 'P4A' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-101' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    fireEvent.click(screen.getByRole('button', { name: /refresh assignments/i }));
    await waitFor(() => expect(substituteAssignmentsApi.list).toHaveBeenCalledWith({
      schoolId: 'school-steck-demo',
      teacherId: 'teacher-sub-b'
    }));
    const panel = await screen.findByLabelText('My substitute assignments');
    expect(within(panel).getAllByText('Math · P4A')).toHaveLength(2);
    expect(within(panel).getAllByText(/Day 1 P1/)[0]).toBeInTheDocument();
    expect(within(panel).getAllByText(/Original: Ms. Chan/)[0]).toBeInTheDocument();

    fireEvent.click(within(panel).getAllByRole('button', { name: /accept/i })[0]);
    await waitFor(() => expect(substituteAssignmentsApi.respond).toHaveBeenCalledWith({
      assignmentId: 'assignment-1',
      status: 'accepted',
      teacherId: 'teacher-sub-b'
    }));
    expect(await screen.findByText('Substitute offer accepted.')).toBeInTheDocument();
    expect(within(panel).getByText('accepted')).toBeInTheDocument();

    fireEvent.click(within(panel).getAllByRole('button', { name: /decline/i })[0]);
    await waitFor(() => expect(substituteAssignmentsApi.respond).toHaveBeenCalledWith({
      assignmentId: 'assignment-2',
      status: 'declined',
      teacherId: 'teacher-sub-b'
    }));
    expect(await screen.findByText('Substitute offer declined.')).toBeInTheDocument();
    expect(within(panel).getByText('declined')).toBeInTheDocument();
  });

  it('shows unfilled coverage gaps, applies filters, and resolves a gap from the queue', async () => {
    const { timetable, periods } = createDefaultTimetable();
    const session = createDemoSession({
      id: 'session-1',
      timetable,
      period: periods[0],
      subjectId: 'Math',
      gradeLevelId: 'P4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo'
    });
    const coverageApi: CoverageApi = {
      listUnfilled: vi.fn(async () => ({
        items: [coverageQueueItem({ classSession: session })]
      })),
      markNoCoverageNeeded: vi.fn(async () => ({}))
    };

    render(<SchedulePlannerPage api={createDemoSchedulePlannerApi()} leaveApi={null} coverageApi={coverageApi} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));
    await screen.findByText('Default timetable created.');
    await confirmTimetableStructure();

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-1' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Math' } });
    fireEvent.change(screen.getByLabelText('Class section'), { target: { value: 'P4A' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-101' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    const queue = screen.getByLabelText('Unfilled coverage queue');
    fireEvent.change(within(queue).getByLabelText('Coverage date filter'), { target: { value: '2026-05-04' } });
    fireEvent.change(within(queue).getByLabelText('Coverage teacher filter'), { target: { value: 'teacher-demo' } });
    fireEvent.click(within(queue).getByRole('button', { name: /refresh coverage queue/i }));

    await waitFor(() => expect(coverageApi.listUnfilled).toHaveBeenCalledWith({
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      teacherId: 'teacher-demo',
      date: '2026-05-04'
    }));
    expect(within(queue).getByText(/Math · P4A/)).toBeInTheDocument();
    expect(within(queue).getByText(/Day 1 P1/)).toBeInTheDocument();
    expect(within(queue).getByText(/Absent: Ms. Chan/)).toBeInTheDocument();
    expect(within(queue).getByRole('link', { name: /open assignment flow/i })).toHaveAttribute('href', '#leave');

    fireEvent.click(within(queue).getByRole('button', { name: /retry recommendation/i }));
    expect(await screen.findByText('Open the leave assignment panel to retry recommendations.')).toBeInTheDocument();

    fireEvent.click(within(queue).getByRole('button', { name: /mark no coverage needed/i }));
    await waitFor(() => expect(coverageApi.markNoCoverageNeeded).toHaveBeenCalledWith({
      leaveRequestId: 'leave-coverage-1',
      impactId: 'impact-coverage-1',
      adjustmentReason: 'Marked no coverage needed from unfilled coverage queue.'
    }));
    expect(await screen.findByText('Coverage gap resolved.')).toBeInTheDocument();
    expect(within(queue).queryByText(/Math · P4A/)).not.toBeInTheDocument();
  });

  it('real coverage API client lists unfilled coverage and marks no coverage needed through backend routes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/auth/sign-in')) {
        return new Response(JSON.stringify({ session: { csrfToken: 'csrf-token' } }), { status: 200 });
      }
      if (url.includes('/api/roster/coverage/unfilled?')) {
        return new Response(JSON.stringify({ items: [coverageQueueItem({})] }), { status: 200 });
      }
      if (url.endsWith('/api/roster/leave/leave-coverage-1/impacts')) {
        return new Response(JSON.stringify({ impacts: [] }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url} ${init?.method ?? 'GET'}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createRosterCoverageApi } = await import('../../src/features/rostering/coverage/coverageApi.js');
    const api = createRosterCoverageApi();
    await api.listUnfilled({
      schoolId: 'school-steck-demo',
      termId: 'term-2026-t1',
      teacherId: 'teacher-demo',
      date: '2026-05-04'
    });
    await api.markNoCoverageNeeded({
      leaveRequestId: 'leave-coverage-1',
      impactId: 'impact-coverage-1',
      adjustmentReason: 'No cover needed.'
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://127.0.0.1:3001/api/auth/sign-in',
      'http://127.0.0.1:3001/api/roster/coverage/unfilled?schoolId=school-steck-demo&termId=term-2026-t1&teacherId=teacher-demo&date=2026-05-04',
      'http://127.0.0.1:3001/api/auth/sign-in',
      'http://127.0.0.1:3001/api/roster/leave/leave-coverage-1/impacts'
    ]);
    expect(fetchMock.mock.calls[3][1]?.headers).toMatchObject({ 'x-schoolroster-csrf': 'csrf-token' });
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual({
      adjustmentReason: 'No cover needed.',
      updateCoverage: [{ impactId: 'impact-coverage-1', coverageRequired: false }]
    });
  });

  it('covers full-day and PM half-day leave options in the end-to-end UI flow', async () => {
    render(<SchedulePlannerPage api={createDemoSchedulePlannerApi()} leaveApi={null} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));
    await screen.findByText('Default timetable created.');
    await confirmTimetableStructure();

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-1' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Math' } });
    fireEvent.change(screen.getByLabelText('Class section'), { target: { value: 'P4A' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-101' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-5' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Science' } });
    fireEvent.change(screen.getByLabelText('Class section'), { target: { value: 'P4B' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-102' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    fireEvent.change(screen.getByLabelText('Leave duration'), { target: { value: 'full_day' } });
    expect(screen.getByLabelText('Impacted sessions preview')).toHaveTextContent('Math · P4A');
    expect(screen.getByLabelText('Impacted sessions preview')).toHaveTextContent('Science · P4B');
    fireEvent.click(screen.getByRole('button', { name: /submit leave request/i }));
    await screen.findByText('Leave request submitted.');

    fireEvent.change(screen.getByLabelText('Leave duration'), { target: { value: 'pm_half_day' } });
    expect(screen.getByLabelText('Impacted sessions preview')).not.toHaveTextContent('Math · P4A');
    expect(screen.getByLabelText('Impacted sessions preview')).toHaveTextContent('Science · P4B');
    fireEvent.click(screen.getByRole('button', { name: /submit leave request/i }));

    expect(await screen.findByText('Leave request submitted.')).toBeInTheDocument();
    expect(screen.getByLabelText('Teacher leave status')).toHaveTextContent('Full day');
    expect(screen.getByLabelText('Teacher leave status')).toHaveTextContent('PM half day');
  });

  it('wires teacher leave submission to the real leave API seam', async () => {
    const leaveApi: LeaveApi = {
      createTeacherLeave: vi.fn(async (input) => ({
        leaveRequest: {
          id: 'api-leave-1',
          schoolId: 'school-steck-demo',
          teacherId: input.teacherId,
          startDate: input.startDate,
          endDate: input.endDate,
          durationType: input.durationType,
          leaveType: input.leaveType,
          coverageRequired: input.coverageRequired,
          status: 'pending' as const,
          createdBy: 'user-teacher-demo',
          requestedAt: '2026-04-27T00:00:00.000Z',
          createdAt: '2026-04-27T00:00:00.000Z',
          updatedAt: '2026-04-27T00:00:00.000Z'
        },
        impacts: [{
          id: 'api-impact-1',
          schoolId: 'school-steck-demo',
          leaveRequestId: 'api-leave-1',
          classSessionId: 'session-1',
          impactDate: input.startDate,
          coverageRequired: true,
          coverageStatus: 'unfilled' as const,
          status: 'active' as const,
          source: 'system_computed' as const,
          warningCodes: [],
          createdAt: '2026-04-27T00:00:00.000Z',
          updatedAt: '2026-04-27T00:00:00.000Z'
        }]
      })),
      createAdminLeave: vi.fn(),
      adjustImpacts: vi.fn(),
      approveLeave: vi.fn(),
      rejectLeave: vi.fn(),
      getImpacts: vi.fn()
    };
    render(<SchedulePlannerPage api={createDemoSchedulePlannerApi()} leaveApi={leaveApi} />);
    fireEvent.click(screen.getByRole('button', { name: /start from 5-day default/i }));
    await screen.findByText('Default timetable created.');
    await confirmTimetableStructure();
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'period-1-1' } });
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: 'teacher-demo' } });
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'room-101' } });
    fireEvent.click(screen.getByRole('button', { name: /add session/i }));
    await screen.findByText('Session added to draft timetable.');

    fireEvent.change(screen.getByLabelText('Leave duration'), { target: { value: 'am_half_day' } });
    fireEvent.click(screen.getByRole('button', { name: /submit leave request/i }));

    await waitFor(() => expect(leaveApi.createTeacherLeave).toHaveBeenCalledTimes(1));
    expect(vi.mocked(leaveApi.createTeacherLeave).mock.calls[0][0]).toMatchObject({
      teacherId: 'teacher-demo',
      durationType: 'am_half_day',
      sessions: [expect.objectContaining({ id: 'session-1' })],
      periods: expect.arrayContaining([expect.objectContaining({ id: 'period-1-1' })])
    });
    expect(await screen.findByText('Leave request submitted.')).toBeInTheDocument();
  });

  it('real leave API client signs in, syncs sessions, and posts leave to backend routes', async () => {
    const { timetable, periods } = createDefaultTimetable();
    const session = createDemoSession({
      id: 'session-api-client',
      timetable,
      period: periods[0],
      subjectId: 'Math',
      gradeLevelId: 'P4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo'
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/auth/sign-in')) {
        return new Response(JSON.stringify({ session: { csrfToken: 'csrf-token' } }), { status: 200 });
      }
      if (url.endsWith('/api/roster/timetables')) {
        return new Response(JSON.stringify({ timetable: { ...timetable, id: 'api-timetable' }, periods }), { status: 201 });
      }
      if (url.endsWith('/api/roster/sessions')) {
        return new Response(JSON.stringify({ session }), { status: 201 });
      }
      if (url.endsWith('/api/roster/leave')) {
        return new Response(JSON.stringify({
          leaveRequest: {
            id: 'api-leave-client',
            schoolId: 'school-steck-demo',
            teacherId: 'teacher-demo',
            startDate: '2026-05-04',
            endDate: '2026-05-04',
            durationType: 'am_half_day',
            leaveType: 'sick',
            coverageRequired: true,
            status: 'pending',
            createdBy: 'user-teacher-demo',
            requestedAt: '2026-04-27T00:00:00.000Z',
            createdAt: '2026-04-27T00:00:00.000Z',
            updatedAt: '2026-04-27T00:00:00.000Z'
          },
          impacts: []
        }), { status: 201 });
      }
      throw new Error(`Unexpected fetch ${url} ${init?.method ?? 'GET'}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const api = createRosterLeaveApi();
    await api.createTeacherLeave({
      teacherId: 'teacher-demo',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      durationType: 'am_half_day',
      leaveType: 'sick',
      coverageRequired: true,
      sessions: [session],
      periods
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://127.0.0.1:3001/api/auth/sign-in',
      'http://127.0.0.1:3001/api/roster/timetables',
      'http://127.0.0.1:3001/api/roster/sessions',
      'http://127.0.0.1:3001/api/auth/sign-in',
      'http://127.0.0.1:3001/api/roster/leave'
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[4][1]?.body))).toMatchObject({
      teacherId: 'teacher-demo',
      durationType: 'am_half_day'
    });
  });

  it('real substitute recommendation API client calls recommend and polling backend routes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/auth/sign-in')) {
        return new Response(JSON.stringify({ session: { csrfToken: 'csrf-token' } }), { status: 200 });
      }
      if (url.includes('/api/roster/substitutes/recommend?')) {
        return new Response(JSON.stringify({
          job_id: 'job-api',
          status: 'running',
          current_step: 'scoring_candidates',
          progress: 0.5,
          recommendations: [],
          reason_codes: []
        }), { status: 200 });
      }
      if (url.endsWith('/api/roster/substitutes/recommendations/job-api')) {
        return new Response(JSON.stringify({
          job: {
            job_id: 'job-api',
            status: 'completed',
            current_step: 'completed',
            progress: 1,
            school_id: 'school-steck-demo',
            leave_id: 'leave-api',
            session_id: 'session-api',
            created_at: '2026-04-28T00:00:00.000Z',
            updated_at: '2026-04-28T00:00:00.000Z',
            result: { recommendations: [recommendation({})], reason_codes: [] }
          }
        }), { status: 200 });
      }
      if (url.endsWith('/api/roster/substitutes')) {
        return new Response(JSON.stringify({
          assignment: {
            id: 'assignment-api',
            schoolId: 'school-steck-demo',
            leaveRequestId: 'leave-api',
            classSessionId: 'session-api',
            originalTeacherId: 'teacher-demo',
            substituteTeacherId: 'teacher-wong',
            assignedBy: 'user-admin-demo',
            assignedAt: '2026-04-28T00:00:00.000Z',
            status: 'offered'
          },
          assignments: []
        }), { status: 201 });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const api = createRosterSubstituteRecommendationApi();
    await api.recommend({ leaveId: 'leave-api', sessionId: 'session-api', asyncMode: true });
    await api.getJob('job-api');
    await api.createOffer({ leaveId: 'leave-api', sessionId: 'session-api', substituteTeacherId: 'teacher-wong' });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://127.0.0.1:3001/api/auth/sign-in',
      'http://127.0.0.1:3001/api/roster/substitutes/recommend?leave_id=leave-api&session_id=session-api&async=true',
      'http://127.0.0.1:3001/api/auth/sign-in',
      'http://127.0.0.1:3001/api/roster/substitutes/recommendations/job-api',
      'http://127.0.0.1:3001/api/auth/sign-in',
      'http://127.0.0.1:3001/api/roster/substitutes'
    ]);
    expect(fetchMock.mock.calls[5][1]?.headers).toMatchObject({ 'x-schoolroster-csrf': 'csrf-token' });
    expect(JSON.parse(String(fetchMock.mock.calls[5][1]?.body))).toMatchObject({ substituteTeacherId: 'teacher-wong' });
  });

  it('real schedule API client creates, mutates, and publishes through backend routes', async () => {
    const { timetable, periods } = createDefaultTimetable();
    const apiTimetable = { ...timetable, id: 'api-timetable', updatedAt: '2026-04-27T01:00:00.000Z' };
    const apiPeriods = periods.map((period) => ({ ...period, timetableId: apiTimetable.id, id: `api-${period.id}` }));
    const apiSession = createDemoSession({
      id: 'api-session-1',
      timetable: apiTimetable,
      period: apiPeriods[0],
      subjectId: 'Math',
      gradeLevelId: 'P4',
      section: 'A',
      roomId: 'room-101',
      assignedTeacherId: 'teacher-demo'
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/auth/sign-in')) {
        return new Response(JSON.stringify({ session: { csrfToken: 'csrf-token' } }), { status: 200 });
      }
      if (url.includes('/api/roster/timetables?')) {
        return new Response(JSON.stringify({ timetables: [] }), { status: 200 });
      }
      if (url.endsWith('/api/roster/timetables') && init?.method === 'POST') {
        return new Response(JSON.stringify({ timetable: apiTimetable, periods: apiPeriods }), { status: 201 });
      }
      if (url.endsWith('/api/roster/sessions') && init?.method === 'POST') {
        return new Response(JSON.stringify({ session: apiSession }), { status: 201 });
      }
      if (url.endsWith('/api/roster/timetables/api-timetable/publish')) {
        return new Response(JSON.stringify({
          timetable: { ...apiTimetable, status: 'published', publishedAt: '2026-04-27T02:00:00.000Z' }
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch ${url} ${init?.method ?? 'GET'}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const api = createRosterSchedulePlannerApi();
    const created = await api.createDefaultTimetable();
    const saved = await api.createSession({
      timetable: created.timetable,
      draft: {
        timetablePeriodId: created.periods[0].id,
        subjectId: 'Math',
        gradeLevelId: 'p4',
        section: 'a',
        roomId: 'room-101',
        assignedTeacherId: 'teacher-demo',
        equipmentResourceIds: ['projector-1'],
        notes: ''
      },
      sessionCount: 0
    });
    const published = await api.publishTimetable({ timetable: created.timetable });

    expect(saved.id).toBe('api-session-1');
    expect(published.status).toBe('published');
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://127.0.0.1:3001/api/auth/sign-in',
      'http://127.0.0.1:3001/api/roster/timetables?schoolId=school-steck-demo&termId=term-2026-t1',
      'http://127.0.0.1:3001/api/roster/timetables',
      'http://127.0.0.1:3001/api/auth/sign-in',
      'http://127.0.0.1:3001/api/roster/sessions',
      'http://127.0.0.1:3001/api/auth/sign-in',
      'http://127.0.0.1:3001/api/roster/timetables/api-timetable/publish'
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[4][1]?.body))).not.toHaveProperty('id');
  });
});
