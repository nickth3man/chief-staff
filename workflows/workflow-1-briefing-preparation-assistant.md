# Workflow 1: Briefing Preparation Assistant

## Overview
**Purpose:** Prepare and deliver a comprehensive executive briefing before a scheduled meeting. The pipeline confirms the meeting, retrieves historical organizational context, optionally collects additional operator input, generates a written briefing, synthesizes an audio version, and delivers both before the meeting start time.

**Step count:** 15
**Step groupings:** Trigger (1) / Main Flow (3) / Branching Logic (1) / Path A: Supplemental Context Processing (5) / Delivery Phase (5)

---

## Abstract Component Types Used

| Component Type | Role in This Pipeline |
| --- | --- |
| Inbound Webhook Event Provider | Receives structured event metadata at the trigger |
| SMTP Email Delivery System | Outbound notifications (Steps 2, 13); inbound HITL intake (Step 6) |
| Tabular Data Store (Read API) | Historical organization context lookup (Step 3) |
| Hierarchical Object/File Storage System | Directory resolution (Step 7) and file asset retrieval (Step 8) |
| Asynchronous HITL Gateway | Boolean triage input (Step 4); multi-field intake (Step 6) |
| Chat Notification System | HITL prompt delivery (Step 4); audio delivery (Step 14) |
| LLM Gateway | Document summarization (Step 9); professional briefing generation (Step 10) |
| Text-to-Speech (TTS) Audio Synthesis Engine | Audio synthesis of the written briefing (Step 11) |
| Time-based Orchestrator Event Loop | Conditional wait for delivery window (Step 12) |
| Address Book / Recipient Resolver | Resolves notification recipients from event metadata (Steps 2, 13, 14) |
| Document Format Renderer | Rich-text briefing document (Steps 9, 10); markdown email body (Step 13) |
| Clock Provider | Supplies current time and event-relative time calculations (Step 12) |
| Failure Strategy Registry | Pause-and-notify behavior when storage lookups fail (Steps 7, 8) |
| Multi-Modal Output Generator | Produces paired text (Step 10) and audio (Step 11) artifacts of the same content |
| Multi-Channel Delivery Router | Routes the briefing artifact to email and chat channels (Steps 13, 14) |
| Service Connector / Identity-bound Adapter | Identity-bound bindings to all external interfaces |
| Conditional Edge | Routes between Path A and Path B (Step 5) |
| Graph Termination Node | Clears state and ends the run (Step 15) |

---

## Trigger

### Step 1: Event Scheduled Inbound Stream
- **Step type:** Inbound Webhook Event Provider
- **Trigger condition:** An external scheduling system emits a structured event payload
- **Input schema (`event`):**
  - `Event Name`
  - `Event Start` (date/time)
  - `Event Duration`
  - `Invitee Name`
  - `Invitee Electronic Address`
  - `Organizer Name`
  - `Organizer Electronic Address`
  - `Guests` (list)
  - `Event Type`
- **Output:** `event` (single object passed to all downstream steps)

---

## Main Flow

### Step 2: Outbound Transactional Notification
- **Step type:** SMTP Email Delivery System
- **Recipient source:** `event.Invitee Electronic Address` (To); `event.Guests` (CC)
- **Sender identity:** Workflow operator (configured)
- **Subject template:** `{event.Event Name} - Confirmation`
- **Body template:**
  - Greeting with invitee name
  - Confirmation that the event is scheduled
  - Event Name, Start time, Duration
  - Signature with organizer name
- **Output:** `notification1` (delivery record)

### Step 3: Fetch Organization Context
- **Step type:** Tabular Data Store (Read API)
- **Query:** Find rows in the configured sheet matching event metadata
- **Returned fields:**
  - `Target Company Name` (used downstream for directory resolution)
  - Additional context fields
- **Output:** `orgContext` (one or more rows)

### Step 4: Asynchronous HITL Triage
- **Step type:** Asynchronous HITL Gateway
- **Sub-type:** Boolean Confirmation Input
- **Channel:** Chat Notification System
- **Audience:** Workflow operator
- **Prompt:** "Any new input or additional details to be considered?"
- **Input schema:** Boolean (Yes / No)
- **Reminder policy:** 1 day after initial notification
- **Output:** `triageResponse` (object with boolean field)

---

## Branching Logic

### Step 5: Conditional Edge
- **Step type:** Conditional Edge / Router
- **Routing rule:** `triageResponse.boolean` is exactly `Yes`
- **Path A:** Proceed to Step 6
- **Path B (default):** Skip directly to Step 11 (Delivery Phase)

---

## Path A: Supplemental Context Processing

### Step 6: Asynchronous Context Ingestion Form
- **Step type:** Asynchronous HITL Gateway
- **Sub-type:** Multi-Field Free-Form Input
- **Channel:** SMTP Email Delivery System (or equivalent)
- **Audience:** Workflow operator
- **Input schema (3 fields):**
  1. Free Text (additional information)
  2. File uploads (contextual attachments)
  3. Reference URLs (text)
- **Reminder policy:** 1 day after initial notification
- **Output:** `supplementalContext` (multi-field object)

### Step 7: Directory Resolution
- **Step type:** Hierarchical Object/File Storage System (Directory Lookup)
- **Filter (ALL):**
  - Parent directory is one of [designated root directory]
  - Directory name CONTAINS `orgContext.Target Company Name` (last element)
- **Failure strategy:** Pause run and notify (when no directories match)
- **Selection policy:** First match (when more than one)
- **Output:** `targetDirectory` (single directory)

### Step 8: File Asset Retrieval
- **Step type:** Hierarchical Object/File Storage System (File Lookup)
- **Filter (ALL):**
  - Parent directory is one of `targetDirectory`
  - File title CONTAINS `event.Invitee Name`
  - File title CONTAINS [designated assessment keyword]
- **Failure strategy:** Pause run and notify (when no files match)
- **Selection policy:** First match
- **Output:** `targetFile` (single file)

### Step 9: Document Summarization Node
- **Step type:** LLM Gateway (Summarization)
- **Format renderer:** Plain text summary
- **Input:** `targetFile` contents
- **Output length:** A few paragraphs
- **Output:** `summary` (text)

### Step 10: Professional Briefing Generation
- **Step type:** LLM Gateway (Text Generation)
- **Format renderer:** Rich text / structured document
- **Inputs:**
  - `summary` (from Step 9)
  - `supplementalContext.Free Text`
  - `supplementalContext.File uploads`
  - `supplementalContext.Reference URLs`
  - `targetFile` (raw source)
- **Document schema (5 sections):**
  1. **Key Briefing Items** — 3-5 critical points, prioritized, sequenced, with supporting data
  2. **Briefing Structure & Approach** — opening strategy, framing, visual aids, pacing
  3. **Exception Handling Strategy** — 5-7 anticipated challenging questions with prepared responses, redirect techniques, "bridge" phrases
  4. **Stakeholder-Specific Considerations** — tailored messaging, ally/skeptic identification, conflict resolution, follow-up actions
  5. **Risk Mitigation** — sensitive topics, misinterpretation prevention, contingency plans, what NOT to say
- **Output:** `briefing` (rich text document)

---

## Delivery Phase

### Step 11: Audio Synthesis
- **Step type:** Text-to-Speech (TTS) Audio Synthesis Engine
- **Sub-type:** Multi-Modal Output Generator (paired with Step 10 written output)
- **Input:** `briefing` (rich text)
- **Voice profile:** Configured voice selection
- **Output:** `audioBriefing` (audio file)

### Step 12: State-Managed Time Delay
- **Step type:** Time-based Orchestrator Event Loop (Conditional Wait)
- **Clock source:** `event.Event Start`
- **Wait condition:** Current time equals `event.Event Start - 24 hours`
- **Timeout policy:** No timeout — keep waiting indefinitely
- **Output:** Continues when timing condition is met

### Step 13: Written Briefing Delivery
- **Step type:** SMTP Email Delivery System
- **Format renderer:** Rich text email body
- **Recipient source:** `event.Organizer Electronic Address`
- **Sender identity:** Workflow operator (configured)
- **Subject template:** "Summary"
- **Body template:**
  - Greeting with organizer name
  - Reference to briefing content for invitee
  - Signature
- **Attachments:** `briefing` (the document artifact)
- **Output:** `delivery1` (delivery record)

### Step 14: Audio Briefing Delivery
- **Step type:** Chat Notification System (Multi-Channel Delivery Router)
- **Recipient source:** `event.Organizer Electronic Address` (direct message channel)
- **Message template:** Notification that audio recording is attached for preparation
- **Attachment:** `audioBriefing` (with file reference)
- **Link previews:** Enabled
- **Output:** `delivery2` (delivery record)

### Step 15: Graph Termination
- **Step type:** Graph Termination Node
- **Trigger:** Always at end of run
- **Action:** Clear in-memory state and end the execution run

---

## Data Flow Summary

```
External Scheduling Event
    |
    v
[1] Event metadata (name, invitee, organizer, dates, etc.)
    |
    +---> [2] Confirmation notification to invitee
    |
    +---> [3] Lookup historical org context from tabular store
    |
    +---> [4] Asynchronous boolean triage with operator
              |
              +---> [5] Conditional router: Yes or No?
                        |
                        +---> YES (Path A):
                        |       [6] Multi-field intake form
                        |       [7] Directory lookup
                        |       [8] File asset retrieval
                        |       [9] Document summarization
                        |       [10] Professional briefing generation
                        |
                        +---> NO (Path B): Skip to delivery
    |
    v
[11] Audio synthesis of the briefing
    |
[12] Wait until 24 hours before event start
    |
[13] Email written briefing to organizer
    |
[14] Send audio briefing to organizer (chat channel)
    |
[15] End run
```

---

## Pipeline Configuration Notes

- **Delivery window:** Briefing artifacts are released 24 hours before the scheduled event start time.
- **File identification pattern:** A file is matched by title containing the invitee name AND a designated assessment keyword (configured abstract keyword).
- **Directory identification pattern:** A directory is matched by being a child of a configured root directory AND having a name that contains the target company name from the org context lookup.
- **Briefing content structure:** All generated briefings follow the 5-section schema (Items / Structure / Exception Handling / Stakeholder Considerations / Risk Mitigation) and include 3-5 key items and 5-7 anticipated questions.
- **Reminder cadence:** HITL prompts (Steps 4, 6) emit a follow-up reminder 1 day after the initial notification if no response is received.
- **Multi-modal pairing:** Step 11 audio is always paired with the Step 10 written briefing; both refer to the same source content.
- **Multi-channel delivery:** The same briefing artifact is delivered to the organizer through two channels — email (Step 13) and chat (Step 14).
