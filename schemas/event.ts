import { z } from 'zod';

export const EventSchema = z.object({
  'Event Name': z.string().min(1),
  'Event Start': z.string().datetime(),
  'Event Duration': z.string(),
  'Invitee Name': z.string().min(1),
  'Invitee Electronic Address': z.string().email(),
  'Organizer Name': z.string().min(1),
  'Organizer Electronic Address': z.string().email(),
  Guests: z.array(z.string()),
  'Event Type': z.string().min(1),
});

export const OrgContextSchema = z.object({
  'Target Company Name': z.string().min(1),
  Industry: z.string().optional(),
  Size: z.string().optional(),
  'Last Briefing Date': z.string().optional(),
  'Context Notes': z.string().optional(),
});

export const TriageResponseSchema = z.object({
  'Additional Input?': z.enum(['Yes', 'No']),
});

export const SupplementalFileSchema = z.object({
  filename: z.string().min(1),
  path: z.string().min(1),
  content: z.string().optional(),
});

export const SupplementalContextSchema = z.object({
  'Free Text (Additional Information)': z.string().optional(),
  'Additional Files (Contextual)': z.array(SupplementalFileSchema).optional(),
  'Any reference URLs:': z.array(z.string().url()).optional(),
});

export const BriefingSectionsSchema = z.object({
  // The prompt asks for 3-5 / 5-7 items but thinking models (e.g. Ring-2.6-1T)
  // sometimes return fewer after spending tokens on reasoning. Accept any
  // non-empty list rather than failing the whole briefing.
  'Key Briefing Items': z.array(z.string()).min(1).max(10),
  'Briefing Structure & Approach': z.string(),
  'Exception Handling Strategy': z
    .array(
      z.object({
        question: z.string(),
        response: z.string(),
        bridge: z.string(),
      })
    )
    .min(1)
    .max(10),
  'Stakeholder-Specific Considerations': z.string(),
  'Risk Mitigation': z.string(),
});

export const BriefingSchema = z.object({
  event: EventSchema,
  orgContext: OrgContextSchema.nullable(),
  summary: z.string(),
  sections: BriefingSectionsSchema,
  markdown: z.string(),
  generatedAt: z.string().datetime(),
  runId: z.string().uuid(),
});
