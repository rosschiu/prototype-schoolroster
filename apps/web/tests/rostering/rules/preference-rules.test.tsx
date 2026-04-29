import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PatchSubstitutePreferenceRulesRequest, SubstitutePreferenceRule } from '../../../../../packages/contracts/src/rostering.js';
import { PreferenceRulesPanel } from '../../../src/features/rostering/rules/PreferenceRulesPanel.js';
import type { PreferenceRulesApi } from '../../../src/features/rostering/rules/preferenceRulesApi.js';
import { teachers } from '../../../src/features/rostering/schedule/mockRosterData.js';
import { createDemoSchedulePlannerApi } from '../../../src/features/rostering/schedule/schedulePlannerApi.js';
import { SchedulePlannerPage } from '../../../src/routes/rostering/SchedulePlannerPage.js';

function preferenceRule(input: Partial<SubstitutePreferenceRule>): SubstitutePreferenceRule {
  return {
    id: input.id ?? 'preference-rule-1',
    schoolId: 'school-steck-demo',
    substituteTeacherId: input.substituteTeacherId ?? 'teacher-lam',
    scope: input.scope ?? 'school',
    preferenceType: input.preferenceType ?? 'preferred',
    weight: input.weight ?? 0.3,
    subjectId: input.subjectId,
    gradeLevelId: input.gradeLevelId,
    originalTeacherId: input.originalTeacherId,
    scheduleSessionId: input.scheduleSessionId,
    reason: input.reason,
    enabled: input.enabled ?? true,
    updatedBy: 'user-admin-demo',
    updatedAt: '2026-04-28T00:00:00.000Z'
  };
}

describe('PreferenceRulesPanel', () => {
  it('saves a scoped preferred substitute rule through the API seam', async () => {
    const api: PreferenceRulesApi = {
      listPreferenceRules: vi.fn(),
      patchPreferenceRules: vi.fn(async (input: PatchSubstitutePreferenceRulesRequest) => ({
        rules: input.rules.map((rule, index) => preferenceRule({ ...rule, id: `saved-${index + 1}` }))
      }))
    };

    render(<PreferenceRulesPanel teachers={teachers} api={api} />);

    fireEvent.change(screen.getByLabelText('Preference rule type'), { target: { value: 'soft_avoid' } });
    fireEvent.change(screen.getByLabelText('Preference scope'), { target: { value: 'subject_grade' } });
    fireEvent.change(screen.getByLabelText('Preference subject'), { target: { value: 'Science' } });
    fireEvent.change(screen.getByLabelText('Preference grade'), { target: { value: 'P5' } });
    fireEvent.change(screen.getByLabelText('Preference weight'), { target: { value: '0.45' } });
    fireEvent.change(screen.getByLabelText('Preference reason'), { target: { value: 'Avoid for upper science' } });
    fireEvent.click(screen.getByRole('button', { name: /save preference/i }));

    await waitFor(() => expect(api.patchPreferenceRules).toHaveBeenCalledTimes(1));
    expect(api.patchPreferenceRules).toHaveBeenCalledWith({
      schoolId: 'school-steck-demo',
      rules: [{
        substituteTeacherId: 'teacher-lam',
        scope: 'subject_grade',
        preferenceType: 'soft_avoid',
        weight: 0.45,
        scheduleSessionId: undefined,
        originalTeacherId: undefined,
        subjectId: 'Science',
        gradeLevelId: 'P5',
        reason: 'Avoid for upper science',
        enabled: true
      }]
    });
    expect(await screen.findByText('Preference rule saved.')).toBeInTheDocument();
    expect(screen.getByLabelText('Preference rule list')).toHaveTextContent('Soft avoid');
  });

  it('loads existing hard exclusion rules and is reachable from the roster shell', async () => {
    const api: PreferenceRulesApi = {
      listPreferenceRules: vi.fn(async () => ({
        rules: [preferenceRule({ preferenceType: 'hard_exclusion', scope: 'school', substituteTeacherId: 'teacher-wong', reason: 'No cover' })]
      })),
      patchPreferenceRules: vi.fn()
    };

    const { unmount } = render(<PreferenceRulesPanel teachers={teachers} api={api} />);
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => expect(api.listPreferenceRules).toHaveBeenCalledWith({ schoolId: 'school-steck-demo' }));
    const list = await screen.findByLabelText('Preference rule list');
    expect(within(list).getByText(/Hard exclusion/)).toBeInTheDocument();
    expect(within(list).getByText('Ms. Wong')).toBeInTheDocument();

    unmount();

    render(
      <SchedulePlannerPage
        api={createDemoSchedulePlannerApi()}
        leaveApi={null}
        availabilityApi={null}
        ruleConfigApi={null}
        preferenceRulesApi={null}
      />
    );
    expect(screen.getByRole('link', { name: /preferences/i })).toHaveAttribute('href', '#preferences');
    expect(screen.getByLabelText('Preference and exclusion rules')).toBeInTheDocument();
  });
});
