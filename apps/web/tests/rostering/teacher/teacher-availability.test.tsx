import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubstituteAvailability } from '../../../../../packages/contracts/src/rostering.js';
import { TeacherAvailabilityPanel } from '../../../src/features/rostering/availability/TeacherAvailabilityPanel.js';
import type { AvailabilityApi } from '../../../src/features/rostering/availability/availabilityApi.js';
import { createDefaultTimetable, teachers } from '../../../src/features/rostering/schedule/mockRosterData.js';

function availabilityRecord(input: Partial<SubstituteAvailability>): SubstituteAvailability {
  return {
    id: input.id ?? 'availability-1',
    schoolId: input.schoolId ?? 'school-steck-demo',
    teacherId: input.teacherId ?? 'teacher-demo',
    date: input.date ?? '2026-05-04',
    timetablePeriodId: input.timetablePeriodId,
    availabilityStatus: input.availabilityStatus ?? 'unavailable',
    reason: input.reason,
    updatedBy: input.updatedBy ?? 'user-teacher-demo',
    updatedAt: input.updatedAt ?? '2026-04-28T00:00:00.000Z'
  };
}

describe('TeacherAvailabilityPanel', () => {
  it('lets a teacher save a full-day self-service availability override', async () => {
    const api: AvailabilityApi = {
      listAvailability: vi.fn(),
      patchAvailability: vi.fn(async (input: Parameters<AvailabilityApi['patchAvailability']>[0]) => ({
        availability: input.records.map((record, index) => availabilityRecord({ ...record, id: `saved-${index + 1}` }))
      }))
    };

    render(<TeacherAvailabilityPanel teachers={teachers} periods={[]} api={api} />);

    fireEvent.change(screen.getByLabelText('Availability status'), { target: { value: 'limited' } });
    fireEvent.change(screen.getByLabelText('Availability reason'), { target: { value: 'Available for emergency coverage only' } });
    fireEvent.click(screen.getByRole('button', { name: /save availability/i }));

    await waitFor(() => expect(api.patchAvailability).toHaveBeenCalledTimes(1));
    expect(api.patchAvailability).toHaveBeenCalledWith({
      schoolId: 'school-steck-demo',
      teacherId: 'teacher-demo',
      role: 'teacher',
      records: [
        {
          date: '2026-05-04',
          availabilityStatus: 'limited',
          reason: 'Available for emergency coverage only'
        }
      ]
    });
    expect(await screen.findByText('Availability saved.')).toBeInTheDocument();
    const list = screen.getByLabelText('Availability overrides');
    expect(within(list).getByText('Limited')).toBeInTheDocument();
    expect(within(list).getByText('Whole day')).toBeInTheDocument();
  });

  it('expands AM half-day availability into period-level records for the selected date', async () => {
    const { periods } = createDefaultTimetable();
    const api: AvailabilityApi = {
      listAvailability: vi.fn(),
      patchAvailability: vi.fn(async (input: Parameters<AvailabilityApi['patchAvailability']>[0]) => ({
        availability: input.records.map((record, index) => availabilityRecord({ ...record, id: `saved-${index + 1}` }))
      }))
    };

    render(<TeacherAvailabilityPanel teachers={teachers} periods={periods} api={api} />);

    fireEvent.change(screen.getByLabelText('Availability scope'), { target: { value: 'am_half_day' } });
    expect(screen.getByLabelText('Availability save preview')).toHaveTextContent('4 records');
    fireEvent.click(screen.getByRole('button', { name: /save availability/i }));

    await waitFor(() => expect(api.patchAvailability).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.patchAvailability).mock.calls[0][0];
    expect(payload.teacherId).toBe('teacher-demo');
    expect(payload.role).toBe('teacher');
    expect(payload.records).toHaveLength(4);
    expect(payload.records.map((record) => record.timetablePeriodId)).toEqual([
      'period-1-1',
      'period-1-2',
      'period-1-3',
      'period-1-4'
    ]);
  });

  it('loads existing teacher availability without allowing a different teacher actor in the UI', async () => {
    const api: AvailabilityApi = {
      listAvailability: vi.fn(async () => ({
        availability: [availabilityRecord({ availabilityStatus: 'unavailable', reason: 'Training day' })]
      })),
      patchAvailability: vi.fn()
    };

    render(<TeacherAvailabilityPanel teachers={teachers} periods={[]} currentTeacherId="teacher-demo" api={api} />);
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => expect(api.listAvailability).toHaveBeenCalledWith({
      schoolId: 'school-steck-demo',
      teacherId: 'teacher-demo',
      startDate: '2026-05-04',
      endDate: '2026-05-04',
      role: 'teacher'
    }));
    expect(await screen.findByText('Availability loaded.')).toBeInTheDocument();
    expect(screen.getByLabelText('Teacher availability self-service')).toHaveTextContent('Ms. Chan');
    expect(screen.queryByLabelText('Teacher')).not.toBeInTheDocument();
    expect(screen.getByText('Training day')).toBeInTheDocument();
  });
});
