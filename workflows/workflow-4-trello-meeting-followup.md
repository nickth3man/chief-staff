# Workflow 4: Meeting Follow-Up — Notes & Draft Follow-up Email

## Overview
**Purpose:** Automated meeting follow-up pipeline. When a raw transcript file is added to a monitored storage directory, the pipeline extracts meeting metadata, reformats the transcript into polished client-ready notes, persists a formatted document, drafts a follow-up email addressed to the attendees, creates a task-list reminder, and adds a card to a visual project-tracking board.

**Step count:** 9
**Step groupings:** Trigger (1) / Node Group 1: Metadata Extraction & Document Generation (4) / Node Group 2: Downstream Task & Tracking Provisioning (4)

---

## Abstract Component Types Used

| Component Type | Role in This Pipeline |
| --- | --- |
| Hierarchical Object/File Storage System (File Watcher) | Watches for new transcript file arrivals (Step 1) |
| LLM Gateway (Schema Extraction) | Extracts meeting name and attendee list (Step 2) |
| LLM Gateway (Document Formatting & Transcription) | Reformats raw transcript into polished notes (Step 3) |
| Document Artifact Persister | Creates a persistent formatted document (Step 4) |
| File Directory Management Unit | Repositions the document to a root storage area (Step 5) |
| LLM Gateway (Professional Communication Drafting) | Drafts the follow-up email (Step 6) |
| SMTP Email Delivery System (Draft Management — Staging Only) | Stages the draft without sending (Step 7) |
| Task Tracking Sink (Reminder Queue) | Adds a reminder task to a task list (Step 8) |
| Task Tracking Sink (Visual Board) | Adds a card to a shared workflow board (Step 9) |
| Asynchronous HITL Gateway (Approval / Edit-Request Input) | Implicit approval/edit loop in the notes prompt (Step 3) |
| Sandboxed Code Executor | Provides code-execution capability to the formatting LLM (Step 3) |
| Clock Provider | Supplies current date for the formatted notes (Step 3) |
| Address Book / Recipient Resolver | Resolves attendee electronic addresses for the draft (Step 7) |
| Document Format Renderer | Renders the formatted notes (Step 3), the document (Step 4), and the email draft (Step 6) |
| Service Connector / Identity-bound Adapter | Binds all external interfaces |
| Failure Strategy Registry | Off (no filter) at the trigger (Step 1) |

---

## Trigger

### Step 1: File Storage Watcher
- **Step type:** Hierarchical Object/File Storage System (File Watcher)
- **Trigger condition:** A new raw transcript file is added to a monitored storage directory
- **Input schema (`file`):**
  - `File Name`
  - `File Content` (raw transcript body)
  - `Creation Time`
  - File metadata
- **Optional filters:** None configured
- **Failure strategy:** Off (no filter)
- **Output:** `file` (single object passed to all downstream steps)

---

## Node Group 1: Metadata Extraction & Document Generation

### Step 2: Schema Extraction LLM
- **Step type:** LLM Gateway (Schema Extraction)
- **Input:**
  - `file` (the transcript file contents)
  - `file.File Name` (file title)
- **Prompt logic:** Extract the following identity vectors from the attached file:
  - Attendee Names
  - Attendee Electronic Addresses
  - Meeting Name
- **Output schema (structured):**
  - `Meeting Name` (text)
  - `Attendees` (list of objects):
    - `Attendee Name` (text)
    - `Attendee Electronic Address` (text)
- **Output:** `metadata` (object with `Meeting Name` and `Attendees` list)

### Step 3: Document Formatting & Transcription LLM
- **Step type:** LLM Gateway (Document Formatting & Transcription)
- **Format renderer:** Rich text / markdown
- **Sandbox:** Code-execution sandbox enabled
- **Clock source:** Current date
- **Sub-type (HITL):** Approval / Edit-Request Input (the prompt ends with an implicit "approve or request edits" gate)
- **Inputs:**
  - Current date
  - `file` (raw transcript)
  - `metadata` (extracted meeting name + attendees)
  - `metadata.Attendees` (attendee list)
  - Code-execution sandbox

- **Transformation logic:**
  1. Read the raw transcript (reference: `file.File Name`)
  2. Rewrite into clean, professional meeting notes using the template structure
  3. Where information is missing, use placeholders like `[TBD]` or `[Not provided]`
  4. Preserve key takeaways, important decisions, risks, opportunities, and comments
  5. After generating the notes, prompt the user to approve them or request edits

- **Output template structure (8 sections):**
  - Date
  - Meeting Name
  - Attendees
  - Attachments
  - Summary / key decisions
  - Actions (rendered as markdown table: Action Item | Owner | Date)
  - Details
  - Ideas for later

- **Output:** `formattedNotes` (rich text / markdown)

### Step 4: Document Artifact Persister
- **Step type:** Document Artifact Persister
- **Input:**
  - `metadata.Meeting Name`
  - `file.Creation Time`
  - `formattedNotes` (the reformatted notes content)
- **Title template:** `{metadata.Meeting Name} - {file.Creation Time}`
- **Content:** `formattedNotes` plus an "@" mention
- **Output:** `document` (with viewable URL)

### Step 5: File Directory Management Unit
- **Step type:** File Directory Management Unit
- **Input:** `document` (treated as a file object)
- **Move target:** Root storage workspace (a designated top-level storage area)
- **Behavior:** Programmatically reposition the newly created document out of the ephemeral creation location into the root storage workspace
- **Output:** `finalDocument` (moved file reference)

---

## Node Group 2: Downstream Task & Tracking Provisioning

### Step 6: Professional Communication Drafting LLM
- **Step type:** LLM Gateway (Professional Communication Drafting)
- **Format renderer:** Rich text
- **Inputs:**
  - `formattedNotes` (the formatted meeting notes)
  - `document.URL` (link to the persisted document)
- **Drafting logic (5 steps):**
  1. Analyze the meeting notes
  2. Open the email by thanking everyone for their time on the call and propose a follow-up meeting if warranted; include the document URL
  3. Outline key takeaways / decisions in bullet format under the header "Key Takeaways:"
  4. Outline the action items and their owners in bullet format
  5. Close with: "Let me know if I missed anything. Looking forward to our next call."
- **Length constraint:** Under 200 words
- **Output:** `emailDraft` (rich text body)

### Step 7: Message Draft Staging Engine
- **Step type:** SMTP Email Delivery System (Draft Management — Staging Only)
- **Format renderer:** Rich text email body
- **Recipient source (via Address Book / Recipient Resolver):** All `metadata.Attendees[].Attendee Electronic Address` (combined)
- **Sender identity:** Workflow operator (configured)
- **Include signature:** No
- **Subject template:** `{metadata.Meeting Name} - Notes and Next Steps`
- **Body:** `emailDraft` (the LLM-generated follow-up)
- **Send policy:** Stage as draft — do NOT transmit
- **Output:** `draft` (saved draft record)

### Step 8: Task Scheduler Integration
- **Step type:** Task Tracking Sink (Reminder Queue)
- **Target list:** Configured task list
- **Created entry:** A reminder to review and send the staged meeting-follow-up draft
- **Output:** `task` (created task record)

### Step 9: Visual Project Board Integrator
- **Step type:** Task Tracking Sink (Visual Board)
- **Target board:** Configured shared workflow board
- **Target list/column:** Configured list within the board
- **Created entry:** A trackable card representing the meeting context for team visibility
- **Output:** `card` (created card record)

---

## Data Flow Summary

```
New raw transcript file detected in monitored storage directory
    |
    v
[1] File object (name, content, creation time, metadata)
    |
    +=== NODE GROUP 1: Metadata Extraction & Document Generation ===+
    |                                                                |
    +---> [2] Schema Extraction LLM
    |       - Meeting Name
    |       - Attendees (Name + Electronic Address pairs)
    |
    +---> [3] Document Formatting & Transcription LLM
    |       - Raw transcript -> polished notes
    |       - Template: Date, Meeting Name, Attendees,
    |         Attachments, Summary, Actions (table),
    |         Details, Ideas for later
    |
    +---> [4] Document Artifact Persister
    |       - Title: "{Meeting Name} - {Creation Time}"
    |       - Content: formatted meeting notes
    |
    +---> [5] File Directory Management Unit
    |       - Move document to root storage workspace
    |
    +=== NODE GROUP 2: Downstream Task & Tracking Provisioning ===+
    |                                                              |
    +---> [6] Professional Communication Drafting LLM
    |       - Thank attendees + link to document
    |       - Key Takeaways (bullets)
    |       - Action Items (bullets with owners)
    |       - Under 200 words
    |
    +---> [7] Message Draft Staging Engine
    |       - To: all attendee electronic addresses (combined)
    |       - Subject: "{Meeting Name} - Notes and Next Steps"
    |       - Body: LLM-generated follow-up
    |       - Staged as draft; NOT sent
    |
    +---> [8] Task Scheduler Integration
    |       - Reminder entry on the configured task list
    |
    +---> [9] Visual Project Board Integrator
            - Trackable card on the configured shared board
```

---

## Pipeline Configuration Notes

- **Trigger source:** Raw transcript files arriving in a monitored storage directory.
- **No trigger filters:** Any new file in the directory triggers the pipeline.
- **Sequential LLM chain:** Three LLM calls run in sequence with distinct roles — schema extraction, document formatting, and email drafting.
- **Document title pattern:** `{Meeting Name} - {File Creation Time}`.
- **Email subject pattern:** `{Meeting Name} - Notes and Next Steps`.
- **Email length constraint:** Under 200 words.
- **Email closing phrase:** "Let me know if I missed anything. Looking forward to our next call."
- **Draft policy:** The follow-up email is always staged as a draft; the pipeline never transmits directly.
- **Document structure (8 sections):** Date, Meeting Name, Attendees, Attachments, Summary / key decisions, Actions (markdown table), Details, Ideas for later.
- **Action item format:** Markdown table with columns Action Item | Owner | Date.
- **Key Takeaways section:** Bulleted list under the header "Key Takeaways:".
- **Sender identity:** Configured workflow operator (no signature included in the draft).
- **Recipient resolution:** The draft is addressed to all attendees whose electronic addresses were extracted in Step 2.
- **Dual task-tracking sinks:** The pipeline persists the meeting context to two sinks — a reminder queue (Step 8) and a visual board (Step 9).
- **Implicit HITL gate:** The Step 3 prompt ends with an "approve or request edits" check, treating the notes output as an Approval / Edit-Request Input.
- **Sandbox capability:** The Step 3 LLM call has access to a code-execution sandbox alongside the transcript content.
