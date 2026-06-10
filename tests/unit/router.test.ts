import { describe, it, expect } from 'vitest';
import { route } from '@agents/orchestrator/router';
import type { ChatMessage } from '@apptypes/agent';

function userMsg(text: string): ChatMessage {
  return { role: 'user', content: text, timestamp: '2026-06-07T12:00:00Z' };
}

describe('orchestrator router', () => {
  it('routes transcript attachments to meeting-followup', () => {
    const decision = route({ messages: [userMsg('process this')], attachedFiles: ['/x/y.txt'] });
    expect(decision.subAgent).toBe('meeting-followup');
  });

  it('routes transcript keyword to meeting-followup', () => {
    const decision = route({ messages: [userMsg('process the transcript from this morning')] });
    expect(decision.subAgent).toBe('meeting-followup');
  });

  it('routes event.json to briefing-prep', () => {
    const decision = route({ messages: [userMsg('brief me')], attachedFiles: ['/x/event.json'] });
    expect(decision.subAgent).toBe('briefing-prep');
  });

  it('routes briefing keywords to briefing-prep', () => {
    const decision = route({ messages: [userMsg('prepare for my meeting with Acme tomorrow')] });
    expect(decision.subAgent).toBe('briefing-prep');
  });

  it('routes weekly keywords to weekly-digest', () => {
    const decision = route({ messages: [userMsg('give me the weekly digest')] });
    expect(decision.subAgent).toBe('weekly-digest');
  });

  it('routes daily keywords to curation', () => {
    const decision = route({ messages: [userMsg("what's in the news today?")] });
    expect(decision.subAgent).toBe('curation');
  });

  it('falls back to chat when no match', () => {
    const decision = route({ messages: [userMsg('hello, who are you?')] });
    expect(decision.subAgent).toBe('curation');
    expect(decision.payload).toMatchObject({ hint: 'no-match' });
  });
});
