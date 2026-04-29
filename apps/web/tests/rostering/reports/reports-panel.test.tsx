import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportsPanel } from '../../../src/features/rostering/reports/ReportsPanel.js';
import type { ReportsApi } from '../../../src/features/rostering/reports/reportsApi.js';

const teachers = [
  { id: 'teacher-demo', name: 'Ms. Chan', subjects: ['Math'] },
  { id: 'teacher-sub-b', name: 'Substitute B', subjects: ['Science'] }
];

const api: ReportsApi = {
  async workload() {
    return { report: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', rows: [
      { teacherId: 'teacher-demo', regularSessionCount: 2, substituteDutyCount: 0, totalWorkloadCount: 2 },
      { teacherId: 'teacher-sub-b', regularSessionCount: 0, substituteDutyCount: 1, totalWorkloadCount: 1 }
    ] } };
  },
  async leaveSummary() {
    return { report: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', rows: [
      { teacherId: 'teacher-demo', leaveType: 'sick', durationType: 'am_half_day', requestCount: 1, coverageImpactCount: 1 }
    ] } };
  },
  async substituteHistory() {
    return { report: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', rows: [
      { assignmentId: 'assignment-1', leaveRequestId: 'leave-1', classSessionId: 'session-1', originalTeacherId: 'teacher-demo', substituteTeacherId: 'teacher-sub-b', status: 'offered', assignedAt: '2026-05-04T00:00:00.000Z', leaveType: 'sick', leaveStartDate: '2026-05-04', leaveEndDate: '2026-05-04' }
    ] } };
  },
  async coverageOperations() {
    return { report: { schoolId: 'school-steck-demo', termId: 'term-2026-t1', totalRequiredImpacts: 2, filledImpactCount: 1, unfilledImpactCount: 1, noCoverageNeededCount: 0, canceledAssignmentCount: 1, reassignmentCount: 1, averageTimeToFillHours: 0.5, fillRate: 0.5 } };
  },
  async exportCsv() {
    return '\uFEFFTeacher ID,Regular Sessions\nteacher-demo,2\n';
  }
};

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(new Uint8Array(reader.result as ArrayBuffer)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsArrayBuffer(blob);
  });
}

describe('ReportsPanel', () => {
  it('loads workload, leave summary, and substitute history reports', async () => {
    render(<ReportsPanel api={api} teachers={teachers} />);
    fireEvent.click(screen.getByRole('button', { name: /load reports/i }));

    const workload = await screen.findByLabelText('Workload report');
    expect(within(workload).getByText('Ms. Chan')).toBeInTheDocument();
    expect(within(workload).getByText('2 regular · 0 substitute')).toBeInTheDocument();
    expect(within(workload).getByText('Substitute B')).toBeInTheDocument();

    const leaveSummary = screen.getByLabelText('Leave summary report');
    expect(within(leaveSummary).getByText('sick')).toBeInTheDocument();
    expect(within(leaveSummary).getByText('am_half_day')).toBeInTheDocument();

    const history = screen.getByLabelText('Substitute history report');
    expect(within(history).getByText('offered')).toBeInTheDocument();
    expect(within(history).getByText('sick 2026-05-04')).toBeInTheDocument();

    const coverage = screen.getByLabelText('Coverage operations report');
    expect(within(coverage).getByText('50%')).toBeInTheDocument();
    expect(within(coverage).getByText('fill rate')).toBeInTheDocument();
    expect(within(coverage).getByText('reassigned')).toBeInTheDocument();
  });

  it('downloads CSV with a UTF-8 BOM for Excel compatibility', async () => {
    const apiWithoutBom: ReportsApi = { ...api, async exportCsv() { return 'Teacher ID,Regular Sessions\nteacher-demo,2\n'; } };
    let exportedBlob: Blob | null = null;
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      exportedBlob = blob as Blob;
      return 'blob:reports-test';
    });
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<ReportsPanel api={apiWithoutBom} teachers={teachers} />);
    fireEvent.click(screen.getByLabelText('Workload report').querySelector('button')!);

    expect(await screen.findByText('workload CSV ready.')).toBeInTheDocument();
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect([...await readBlobBytes(exportedBlob!)].slice(0, 3)).toEqual([0xef, 0xbb, 0xbf]);

    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    anchorClick.mockRestore();
  });
});
