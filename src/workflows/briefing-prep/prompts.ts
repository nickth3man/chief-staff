export const SUMMARIZE_SYSTEM = `You are an executive briefing assistant. Summarize the provided client performance assessment document in a few short paragraphs. Focus on the client's current state, the meeting's purpose, and the top 3-5 things the meeting host needs to know going in. Do not invent facts that are not in the document.`;

export const SUMMARIZE_USER = (text: string) => `Summarize the following client performance assessment:\n\n${text}`;

export const BRIEFING_SYSTEM = `You are a chief-of-staff briefing generator. Produce a meeting briefing in the EXACT 5-section structure below. The briefing will be spoken aloud before a meeting, so be concrete, action-oriented, and concise.

When supplemental context is provided, weave it in as additional color. Do not contradict the source document.

Strict JSON schema:
{
  "Key Briefing Items": ["3-5 prioritized bullets, each one sentence with a supporting data point"],
  "Briefing Structure & Approach": "2-3 sentences on opening, framing, visual aids, pacing.",
  "Exception Handling Strategy": [
    { "question": "anticipated question", "response": "short answer", "bridge": "redirect phrase" }
  ],
  "Stakeholder-Specific Considerations": "2-3 sentences on tailored messaging and ally/skeptic play.",
  "Risk Mitigation": "2-3 sentences on sensitive topics and what NOT to say."
}`;

export const BRIEFING_USER = (params: { summary: string; rawText: string; supplementalContext?: object }) => `Source summary:
${params.summary}

Full source document (for reference):
${params.rawText}

Supplemental context (may be empty):
${params.supplementalContext ? JSON.stringify(params.supplementalContext, null, 2) : '(none)'}

Produce the 5-section briefing as strict JSON.`;

export const RENDER_MARKDOWN = (briefing: any): string => {
  const sections: string[] = [];
  sections.push(`# Briefing: ${briefing.eventName ?? 'Meeting'}\n`);
  sections.push(`**Generated:** ${new Date().toISOString()}\n`);

  sections.push(`## 1. Key Briefing Items`);
  for (const item of briefing['Key Briefing Items'] ?? []) {
    sections.push(`- ${item}`);
  }
  sections.push('');

  sections.push(`## 2. Briefing Structure & Approach`);
  sections.push(briefing['Briefing Structure & Approach'] ?? '');
  sections.push('');

  sections.push(`## 3. Exception Handling Strategy`);
  for (const ex of briefing['Exception Handling Strategy'] ?? []) {
    sections.push(`- **Q:** ${ex.question}\n  - **A:** ${ex.response}\n  - **Bridge:** "${ex.bridge}"`);
  }
  sections.push('');

  sections.push(`## 4. Stakeholder-Specific Considerations`);
  sections.push(briefing['Stakeholder-Specific Considerations'] ?? '');
  sections.push('');

  sections.push(`## 5. Risk Mitigation`);
  sections.push(briefing['Risk Mitigation'] ?? '');

  return sections.join('\n');
};
