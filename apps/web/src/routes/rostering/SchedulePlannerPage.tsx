import { useMemo, useState } from 'react';
import type { ClassSession } from '../../../../../packages/contracts/src/rostering.js';
import { TeacherAvailabilityPanel } from '../../features/rostering/availability/TeacherAvailabilityPanel.js';
import { createRosterAvailabilityApi, type AvailabilityApi } from '../../features/rostering/availability/availabilityApi.js';
import { RuleConfigPanel } from '../../features/rostering/config/RuleConfigPanel.js';
import { createRosterRuleConfigApi, type RuleConfigApi } from '../../features/rostering/config/ruleConfigApi.js';
import { AdminCoverageLifecyclePanel } from '../../features/rostering/coverage/AdminCoverageLifecyclePanel.js';
import { UnfilledCoverageQueue } from '../../features/rostering/coverage/UnfilledCoverageQueue.js';
import { createRosterCoverageLifecycleApi, type CoverageLifecycleApi } from '../../features/rostering/coverage/coverageLifecycleApi.js';
import { createRosterCoverageApi, type CoverageApi } from '../../features/rostering/coverage/coverageApi.js';
import { LeaveWorkspace } from '../../features/rostering/leave/LeaveWorkspace.js';
import { createRosterLeaveApi, type LeaveApi } from '../../features/rostering/leave/leaveApi.js';
import { PreferenceRulesPanel } from '../../features/rostering/rules/PreferenceRulesPanel.js';
import { createRosterPreferenceRulesApi, type PreferenceRulesApi } from '../../features/rostering/rules/preferenceRulesApi.js';
import { ReportsPanel } from '../../features/rostering/reports/ReportsPanel.js';
import { createRosterReportsApi, type ReportsApi } from '../../features/rostering/reports/reportsApi.js';
import { ProjectionViews } from '../../features/rostering/schedule/ProjectionViews.js';
import { PublishPanel } from '../../features/rostering/schedule/PublishPanel.js';
import { ScheduleGrid } from '../../features/rostering/schedule/ScheduleGrid.js';
import { ScheduleOverview } from '../../features/rostering/schedule/ScheduleOverview.js';
import { SessionForm } from '../../features/rostering/schedule/SessionForm.js';
import { TimetableSetupPanel } from '../../features/rostering/schedule/TimetableSetupPanel.js';
import { createInitialPlannerState } from '../../features/rostering/schedule/mockRosterData.js';
import { createRosterSchedulePlannerApi, type SchedulePlannerApi } from '../../features/rostering/schedule/schedulePlannerApi.js';
import type { SchedulePlannerState, SessionDraft } from '../../features/rostering/schedule/types.js';
import { SubstituteAssignmentsPanel } from '../../features/rostering/substitute/SubstituteAssignmentsPanel.js';
import { createRosterSubstituteAssignmentsApi, type SubstituteAssignmentsApi } from '../../features/rostering/substitute/substituteAssignmentsApi.js';
import { createRosterSubstituteRecommendationApi, type SubstituteRecommendationApi } from '../../features/rostering/substitute/substituteRecommendationApi.js';

export function SchedulePlannerPage({
  api = createRosterSchedulePlannerApi(),
  leaveApi,
  availabilityApi,
  ruleConfigApi,
  preferenceRulesApi,
  substituteRecommendationApi,
  substituteAssignmentsApi,
  coverageApi,
  coverageLifecycleApi,
  reportsApi
}: {
  api?: SchedulePlannerApi;
  leaveApi?: LeaveApi | null;
  availabilityApi?: AvailabilityApi | null;
  ruleConfigApi?: RuleConfigApi | null;
  preferenceRulesApi?: PreferenceRulesApi | null;
  substituteRecommendationApi?: SubstituteRecommendationApi | null;
  substituteAssignmentsApi?: SubstituteAssignmentsApi | null;
  coverageApi?: CoverageApi | null;
  coverageLifecycleApi?: CoverageLifecycleApi | null;
  reportsApi?: ReportsApi | null;
}) {
  const [state, setState] = useState<SchedulePlannerState>(() => createInitialPlannerState());
  const [editingSession, setEditingSession] = useState<ClassSession | null>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [busyLabel, setBusyLabel] = useState('');

  const groupedSessions = useMemo(() => state.sessions.filter((session) => session.status !== 'cancelled'), [state.sessions]);
  const leaveApiClient = useMemo(() => (leaveApi === undefined ? createRosterLeaveApi() : leaveApi), [leaveApi]);
  const availabilityApiClient = useMemo(
    () => (availabilityApi === undefined ? createRosterAvailabilityApi() : availabilityApi),
    [availabilityApi]
  );
  const ruleConfigApiClient = useMemo(
    () => (ruleConfigApi === undefined ? createRosterRuleConfigApi() : ruleConfigApi),
    [ruleConfigApi]
  );
  const preferenceRulesApiClient = useMemo(
    () => (preferenceRulesApi === undefined ? createRosterPreferenceRulesApi() : preferenceRulesApi),
    [preferenceRulesApi]
  );
  const substituteRecommendationApiClient = useMemo(
    () => (substituteRecommendationApi === undefined ? createRosterSubstituteRecommendationApi() : substituteRecommendationApi),
    [substituteRecommendationApi]
  );
  const substituteAssignmentsApiClient = useMemo(
    () => (substituteAssignmentsApi === undefined ? createRosterSubstituteAssignmentsApi() : substituteAssignmentsApi),
    [substituteAssignmentsApi]
  );
  const coverageApiClient = useMemo(
    () => (coverageApi === undefined ? createRosterCoverageApi() : coverageApi),
    [coverageApi]
  );
  const coverageLifecycleApiClient = useMemo(
    () => (coverageLifecycleApi === undefined ? createRosterCoverageLifecycleApi() : coverageLifecycleApi),
    [coverageLifecycleApi]
  );
  const reportsApiClient = useMemo(
    () => (reportsApi === undefined ? createRosterReportsApi() : reportsApi),
    [reportsApi]
  );

  async function runPlannerAction(label: string, action: () => Promise<void>) {
    setError('');
    setBusyLabel(label);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Schedule planner action failed.');
    } finally {
      setBusyLabel('');
    }
  }

  function startDefault() {
    void runPlannerAction('Creating default timetable...', async () => {
      const { timetable, periods, sessions } = await api.createDefaultTimetable();
      setState((current) => ({
        ...current,
        timetable,
        periods,
        sessions: sessions ?? [],
        published: timetable.status === 'published'
      }));
      setToast('Default timetable created.');
    });
  }

  function savePeriods(periods: typeof state.periods) {
    void runPlannerAction('Saving timetable structure...', async () => {
      if (!state.timetable) throw new Error('Create a timetable before editing periods.');
      const updated = await api.updatePeriods({ timetable: state.timetable, periods });
      setState((current) => ({
        ...current,
        timetable: updated.timetable,
        periods: updated.periods
      }));
      setToast('Timetable structure saved.');
    });
  }

  function confirmStructure() {
    void runPlannerAction('Confirming timetable structure...', async () => {
      if (!state.timetable) throw new Error('Create a timetable before confirming structure.');
      const updated = await api.confirmTimetableStructure({ timetable: state.timetable, periods: state.periods });
      setState((current) => ({
        ...current,
        timetable: updated.timetable,
        periods: updated.periods
      }));
      setToast('Timetable structure confirmed.');
    });
  }

  function saveSession(draft: SessionDraft, editingSessionId?: string) {
    void runPlannerAction(editingSessionId ? 'Saving session amendment...' : 'Adding session...', async () => {
      if (!state.timetable) throw new Error('Start from a default timetable before adding sessions.');
      const existingSession = editingSessionId ? state.sessions.find((session) => session.id === editingSessionId) : undefined;
      const saved = existingSession
        ? await api.updateSession({ timetable: state.timetable, draft, existingSession })
        : await api.createSession({ timetable: state.timetable, draft, sessionCount: state.sessions.length });
      setState((current) => ({
        ...current,
        sessions: editingSessionId
          ? current.sessions.map((session) => (session.id === editingSessionId ? saved : session))
          : [...current.sessions, saved]
      }));
      setEditingSession(null);
      setToast(editingSessionId ? 'Session amendment saved.' : 'Session added to draft timetable.');
    });
  }

  return (
    <main className="app-shell">
      <aside className="shell-sidebar" aria-label="Steck navigation">
        <div className="shell-sidebar-surface">
          <div className="shell-sidebar-top">
            <div className="shell-brand-mark" aria-hidden="true">S</div>
            <div className="shell-brand-copy">
              <strong>Steck</strong>
              <span>Admin portal</span>
            </div>
          </div>
          <nav className="shell-nav" aria-label="Primary">
            <a className="shell-nav-link" href="#overview"><span>H</span>Home</a>
            <a className="shell-nav-link shell-nav-link-active" href="#planner"><span>R</span>Rostering</a>
            <a className="shell-nav-link" href="#leave"><span>L</span>Leave</a>
            <a className="shell-nav-link" href="#availability"><span>A</span>Availability</a>
            <a className="shell-nav-link" href="#rules"><span>C</span>Rules</a>
            <a className="shell-nav-link" href="#preferences"><span>X</span>Preferences</a>
            <a className="shell-nav-link" href="#projections"><span>P</span>Projections</a>
            <a className="shell-nav-link" href="#reports"><span>R</span>Reports</a>
            <a className="shell-nav-link" href="#"><span>U</span>Users</a>
            <a className="shell-nav-link" href="#"><span>S</span>Settings</a>
          </nav>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-header">
          <nav aria-label="Header breadcrumb" className="shell-breadcrumb">
            <span>Steck</span><span>/</span><strong>Rostering</strong>
          </nav>
          <div className="shell-header-actions">
            <button className="ghost-button" type="button">Notifications</button>
            <button className="profile-button" type="button"><span className="topbar-avatar">A</span>Admin</button>
          </div>
        </header>

        <div className="planner-page" id="overview">
          {busyLabel ? <div className="toast" role="status">{busyLabel}</div> : null}
      {toast && !busyLabel ? <div className="toast" role="status">{toast}</div> : null}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}

      <ScheduleOverview state={state} onStartDefault={startDefault} />

      <section className="planner-layout" id="planner">
        <div>
          <TimetableSetupPanel
            timetable={state.timetable}
            periods={state.periods}
            onSave={savePeriods}
            onConfirm={confirmStructure}
          />
          <ScheduleGrid periods={state.periods} sessions={groupedSessions} teachers={state.teachers} rooms={state.rooms} onEdit={setEditingSession} />
          <PublishPanel
            state={state}
            onPublish={() => {
              void runPlannerAction('Publishing schedule...', async () => {
                if (!state.timetable) throw new Error('Create a timetable before publishing.');
                const timetable = await api.publishTimetable({ timetable: state.timetable });
                setState((current) => ({
                  ...current,
                  published: true,
                  timetable,
                  sessions: current.sessions.map((session) => ({ ...session, status: 'published' }))
                }));
                setToast('Schedule published.');
              });
            }}
            onUnpublish={() => {
              void runPlannerAction('Returning schedule to draft...', async () => {
                if (!state.timetable) throw new Error('Create a timetable before unpublishing.');
                const timetable = await api.unpublishTimetable({ timetable: state.timetable });
                setState((current) => ({
                  ...current,
                  published: false,
                  timetable,
                  sessions: current.sessions.map((session) => ({ ...session, status: 'draft' }))
                }));
                setToast('Schedule returned to draft.');
              });
            }}
          />
        </div>
        <SessionForm
          timetable={state.timetable}
          periods={state.periods}
          sessions={groupedSessions}
          teachers={state.teachers}
          rooms={state.rooms}
          resources={state.resources}
          editingSession={editingSession}
          onSave={saveSession}
          onCancel={() => setEditingSession(null)}
        />
      </section>

          <section id="projections">
            <ProjectionViews state={state} />
          </section>

          <TeacherAvailabilityPanel
            teachers={state.teachers}
            periods={state.periods}
            currentTeacherId="teacher-demo"
            api={availabilityApiClient ?? undefined}
          />

          <RuleConfigPanel api={ruleConfigApiClient ?? undefined} />

          <PreferenceRulesPanel teachers={state.teachers} api={preferenceRulesApiClient ?? undefined} />

          <LeaveWorkspace
            sessions={groupedSessions}
            periods={state.periods}
            teachers={state.teachers}
            rooms={state.rooms}
            resources={state.resources}
            schedulePublished={state.published}
            api={leaveApiClient ?? undefined}
            recommendationApi={substituteRecommendationApiClient ?? undefined}
          />
          <SubstituteAssignmentsPanel
            api={substituteAssignmentsApiClient ?? undefined}
            sessions={groupedSessions}
            periods={state.periods}
            teachers={state.teachers}
            rooms={state.rooms}
          />
          <UnfilledCoverageQueue
            api={coverageApiClient ?? undefined}
            sessions={groupedSessions}
            periods={state.periods}
            teachers={state.teachers}
            rooms={state.rooms}
          />
          <AdminCoverageLifecyclePanel
            api={coverageLifecycleApiClient ?? undefined}
            sessions={groupedSessions}
            periods={state.periods}
            teachers={state.teachers}
            rooms={state.rooms}
          />
          <ReportsPanel
            api={reportsApiClient ?? undefined}
            teachers={state.teachers}
          />
        </div>
      </div>
    </main>
  );
}
