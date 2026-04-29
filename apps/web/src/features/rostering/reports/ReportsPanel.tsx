import { useMemo, useState } from 'react';
import type { CoverageOperationsReport, LeaveSummaryReport, ReportExportType, SubstituteHistoryReport, WorkloadReport } from '../../../../../../packages/contracts/src/rostering.js';
import type { TeacherOption } from '../schedule/types.js';
import type { ReportsApi } from './reportsApi.js';

export function ReportsPanel({ api, teachers, schoolId = 'school-steck-demo', termId = 'term-2026-t1' }: {
  api?: ReportsApi;
  teachers: TeacherOption[];
  schoolId?: string;
  termId?: string;
}) {
  const [workload, setWorkload] = useState<WorkloadReport | null>(null);
  const [leaveSummary, setLeaveSummary] = useState<LeaveSummaryReport | null>(null);
  const [substituteHistory, setSubstituteHistory] = useState<SubstituteHistoryReport | null>(null);
  const [coverageOperations, setCoverageOperations] = useState<CoverageOperationsReport | null>(null);
  const [csvStatus, setCsvStatus] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const teacherById = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher.name])), [teachers]);

  async function loadReports() {
    setBusy('Loading reports...');
    setError('');
    try {
      if (!api) {
        setWorkload({ schoolId, termId, rows: [] });
        setLeaveSummary({ schoolId, termId, rows: [] });
        setSubstituteHistory({ schoolId, termId, rows: [] });
        setCoverageOperations({ schoolId, termId, totalRequiredImpacts: 0, filledImpactCount: 0, unfilledImpactCount: 0, noCoverageNeededCount: 0, canceledAssignmentCount: 0, reassignmentCount: 0, averageTimeToFillHours: null, fillRate: 0 });
        return;
      }
      const [workloadResult, leaveResult, historyResult, coverageResult] = await Promise.all([
        api.workload({ schoolId, termId }),
        api.leaveSummary({ schoolId, termId }),
        api.substituteHistory({ schoolId, termId }),
        api.coverageOperations({ schoolId, termId })
      ]);
      setWorkload(workloadResult.report);
      setLeaveSummary(leaveResult.report);
      setSubstituteHistory(historyResult.report);
      setCoverageOperations(coverageResult.report);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reports failed to load.');
    } finally {
      setBusy('');
    }
  }

  async function exportReport(type: ReportExportType) {
    if (!api) return;
    setError('');
    setCsvStatus(`Exporting ${type}...`);
    try {
      const csv = await api.exportCsv({ type, schoolId, termId });
      const csvWithBom = csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`;
      const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${type}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setCsvStatus(`${type} CSV ready.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'CSV export failed.');
      setCsvStatus('');
    }
  }

  const maxWorkload = Math.max(1, ...(workload?.rows.map((row) => row.totalWorkloadCount) ?? [1]));

  return (
    <section className="panel-card reports-panel" id="reports" aria-label="Roster reports">
      <div className="section-title-row">
        <div>
          <p className="section-kicker">Admin</p>
          <h2>Reports</h2>
        </div>
        <button type="button" onClick={() => void loadReports()}>Load reports</button>
      </div>
      {busy ? <div className="toast inline" role="status">{busy}</div> : null}
      {csvStatus && !busy ? <div className="toast inline" role="status">{csvStatus}</div> : null}
      {error ? <div className="inline-error" role="alert">{error}</div> : null}
      <div className="reports-grid">
        <article className="report-card" aria-label="Workload report">
          <div className="report-card-head"><h3>Workload</h3><button type="button" onClick={() => void exportReport('workload')}>Export CSV</button></div>
          {workload?.rows.length ? workload.rows.map((row) => (
            <div className="workload-row" key={row.teacherId}>
              <span>{teacherById.get(row.teacherId) ?? row.teacherId}</span>
              <strong>{row.totalWorkloadCount}</strong>
              <div className="workload-meter"><span style={{ width: `${(row.totalWorkloadCount / maxWorkload) * 100}%` }} /></div>
              <small>{row.regularSessionCount} regular · {row.substituteDutyCount} substitute</small>
            </div>
          )) : <p className="empty-note">No workload data loaded.</p>}
        </article>
        <article className="report-card" aria-label="Leave summary report">
          <div className="report-card-head"><h3>Leave Summary</h3><button type="button" onClick={() => void exportReport('leave-summary')}>Export CSV</button></div>
          {leaveSummary?.rows.length ? (
            <table><thead><tr><th>Teacher</th><th>Type</th><th>Duration</th><th>Requests</th><th>Impacts</th></tr></thead><tbody>
              {leaveSummary.rows.map((row) => <tr key={`${row.teacherId}-${row.leaveType}-${row.durationType}`}><td>{teacherById.get(row.teacherId) ?? row.teacherId}</td><td>{row.leaveType}</td><td>{row.durationType}</td><td>{row.requestCount}</td><td>{row.coverageImpactCount}</td></tr>)}
            </tbody></table>
          ) : <p className="empty-note">No leave data loaded.</p>}
        </article>
        <article className="report-card report-card-wide" aria-label="Substitute history report">
          <div className="report-card-head"><h3>Substitute History</h3><button type="button" onClick={() => void exportReport('substitute-history')}>Export CSV</button></div>
          {substituteHistory?.rows.length ? (
            <table><thead><tr><th>Original</th><th>Substitute</th><th>Status</th><th>Assigned</th><th>Leave</th></tr></thead><tbody>
              {substituteHistory.rows.map((row) => <tr key={row.assignmentId}><td>{teacherById.get(row.originalTeacherId) ?? row.originalTeacherId}</td><td>{teacherById.get(row.substituteTeacherId) ?? row.substituteTeacherId}</td><td>{row.status}</td><td>{row.assignedAt.slice(0, 10)}</td><td>{row.leaveType ?? 'leave'} {row.leaveStartDate ?? ''}</td></tr>)}
            </tbody></table>
          ) : <p className="empty-note">No substitute history loaded.</p>}
        </article>
        <article className="report-card report-card-wide" aria-label="Coverage operations report">
          <div className="report-card-head"><h3>Coverage Operations</h3><button type="button" onClick={() => void exportReport('coverage-operations')}>Export CSV</button></div>
          {coverageOperations ? (
            <div className="coverage-metrics">
              <div><strong>{Math.round(coverageOperations.fillRate * 100)}%</strong><span>fill rate</span></div>
              <div><strong>{coverageOperations.totalRequiredImpacts}</strong><span>required impacts</span></div>
              <div><strong>{coverageOperations.unfilledImpactCount}</strong><span>unfilled</span></div>
              <div><strong>{coverageOperations.canceledAssignmentCount}</strong><span>canceled</span></div>
              <div><strong>{coverageOperations.reassignmentCount}</strong><span>reassigned</span></div>
              <div><strong>{coverageOperations.averageTimeToFillHours ?? '—'}</strong><span>avg hours to fill</span></div>
            </div>
          ) : <p className="empty-note">No coverage metrics loaded.</p>}
        </article>
      </div>
    </section>
  );
}
