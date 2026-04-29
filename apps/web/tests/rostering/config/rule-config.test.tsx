import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubstituteRuleConfig } from '../../../../../packages/contracts/src/rostering.js';
import { RuleConfigPanel } from '../../../src/features/rostering/config/RuleConfigPanel.js';
import type { RuleConfigApi } from '../../../src/features/rostering/config/ruleConfigApi.js';
import { SchedulePlannerPage } from '../../../src/routes/rostering/SchedulePlannerPage.js';
import { createDemoSchedulePlannerApi } from '../../../src/features/rostering/schedule/schedulePlannerApi.js';

function rule(input: Partial<SubstituteRuleConfig> & Pick<SubstituteRuleConfig, 'criteriaKey'>): SubstituteRuleConfig {
  return {
    id: `rule-${input.criteriaKey}`,
    schoolId: 'school-steck-demo',
    weight: 0.1,
    enabled: true,
    customParams: {},
    updatedAt: '2026-04-28T00:00:00.000Z',
    ...input
  };
}

describe('RuleConfigPanel', () => {
  it('saves admin rule weights and hard constraints through the API seam', async () => {
    const api: RuleConfigApi = {
      listRules: vi.fn(),
      patchRules: vi.fn(async (input: Parameters<RuleConfigApi['patchRules']>[0]) => ({
        rules: input.rules.map((item) => rule({
          criteriaKey: item.criteriaKey,
          weight: item.weight,
          enabled: item.enabled,
          customParams: item.customParams ?? {}
        }))
      }))
    };

    render(<RuleConfigPanel api={api} />);

    fireEvent.click(screen.getByLabelText('Enable Subject competency'));
    fireEvent.change(screen.getByLabelText('Workload balance weight'), { target: { value: '80' } });
    fireEvent.click(screen.getByLabelText('Require competency'));
    fireEvent.change(screen.getByLabelText('Weekly substitute cap'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /save rules/i }));

    await waitFor(() => expect(api.patchRules).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.patchRules).mock.calls[0][0];
    expect(payload.schoolId).toBe('school-steck-demo');
    expect(payload.rules.find((item) => item.criteriaKey === 'workload_balance')).toMatchObject({ weight: 0.8, enabled: true });
    expect(payload.rules.find((item) => item.criteriaKey === 'subject_competency')).toMatchObject({ enabled: false });
    expect(payload.rules.find((item) => item.criteriaKey === 'hard_constraints')?.customParams).toMatchObject({ require_competency: true });
    expect(payload.rules.find((item) => item.criteriaKey === 'weekly_substitute_cap')?.customParams).toMatchObject({ max_per_week: 7 });
    expect(await screen.findByText('Rule configuration saved.')).toBeInTheDocument();
  });

  it('loads existing rules and prevents saving with no enabled positive scoring weight', async () => {
    const api: RuleConfigApi = {
      listRules: vi.fn(async () => ({
        rules: [
          rule({ criteriaKey: 'workload_balance', weight: 0.5, enabled: true }),
          rule({ criteriaKey: 'subject_competency', weight: 0.5, enabled: true }),
          rule({ criteriaKey: 'weekly_substitute_cap', weight: null, enabled: true, customParams: { max_per_week: 4 } }),
          rule({ criteriaKey: 'hard_constraints', weight: null, enabled: true, customParams: { require_competency: false } })
        ]
      })),
      patchRules: vi.fn()
    };

    render(<RuleConfigPanel api={api} />);
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    await waitFor(() => expect(api.listRules).toHaveBeenCalledWith({ schoolId: 'school-steck-demo' }));
    expect(await screen.findByText('Rules loaded.')).toBeInTheDocument();
    const panel = screen.getByLabelText('Rule configuration');
    expect(within(panel).getByLabelText('Weekly substitute cap')).toHaveValue(4);

    fireEvent.click(screen.getByLabelText('Enable Workload balance'));
    fireEvent.click(screen.getByLabelText('Enable Subject competency'));
    fireEvent.click(screen.getByRole('button', { name: /save rules/i }));

    expect(await screen.findByText('Enable at least one scoring criterion with a weight above 0.')).toBeInTheDocument();
    expect(api.patchRules).not.toHaveBeenCalled();
  });

  it('is reachable from the roster shell alongside teacher availability', () => {
    render(
      <SchedulePlannerPage
        api={createDemoSchedulePlannerApi()}
        leaveApi={null}
        availabilityApi={null}
        ruleConfigApi={null}
      />
    );

    expect(screen.getByRole('link', { name: /rules/i })).toHaveAttribute('href', '#rules');
    expect(screen.getByRole('link', { name: /availability/i })).toHaveAttribute('href', '#availability');
    expect(screen.getByLabelText('Rule configuration')).toBeInTheDocument();
    expect(screen.getByLabelText('Teacher availability self-service')).toBeInTheDocument();
  });
});
