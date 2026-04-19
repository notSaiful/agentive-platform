import { describe, it, expect } from 'vitest';
import { QUALIFICATION_STARTER_PROMPT } from '../qualification-starter.js';
import { CONVERSATION_LOOP_PROMPT } from '../conversation-loop.js';

describe('Qualification Prompts', () => {
  it('qualification starter contains required elements', () => {
    expect(QUALIFICATION_STARTER_PROMPT).toContain('real estate');
    expect(QUALIFICATION_STARTER_PROMPT).toContain('{name}');
    expect(QUALIFICATION_STARTER_PROMPT).toContain('fair housing');
  });

  it('conversation loop contains template placeholders', () => {
    expect(CONVERSATION_LOOP_PROMPT).toContain('{qualification_data}');
    expect(CONVERSATION_LOOP_PROMPT).toContain('{remaining_fields}');
    expect(CONVERSATION_LOOP_PROMPT).toContain('ROUTE:');
    expect(CONVERSATION_LOOP_PROMPT).toContain('fair housing');
  });

  it('qualification starter renders with name', () => {
    const rendered = QUALIFICATION_STARTER_PROMPT.replace('{name}', 'Sarah');
    expect(rendered).toContain('Sarah');
    expect(rendered).not.toContain('{name}');
  });
});