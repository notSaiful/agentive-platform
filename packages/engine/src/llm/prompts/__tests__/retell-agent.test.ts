import { describe, it, expect } from 'vitest';
import { RETELL_AGENT_PROMPT, RETELL_TOOL_DEFINITIONS } from '../retell-agent.js';

describe('Retell Agent Prompt', () => {
  it('contains qualification flow instructions', () => {
    expect(RETELL_AGENT_PROMPT).toContain('real estate');
    expect(RETELL_AGENT_PROMPT).toContain('budget');
    expect(RETELL_AGENT_PROMPT).toContain('timeline');
    expect(RETELL_AGENT_PROMPT).toContain('fair housing');
  });

  it('includes submitQualificationData tool definition', () => {
    expect(RETELL_TOOL_DEFINITIONS).toHaveLength(1);
    expect(RETELL_TOOL_DEFINITIONS[0].name).toBe('submitQualificationData');
  });
});