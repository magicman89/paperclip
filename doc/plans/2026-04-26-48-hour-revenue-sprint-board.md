# 48-Hour Revenue Sprint Board for Paperclip Agents

Goal: get the first customer / first paid commitment as fast as possible by giving every active Paperclip agent a concrete revenue task, short feedback cadence, and hard closeout rule.

Scope: operations only. No code pushes. Engineering agents may inspect, verify, or draft, but do not ship product changes during this sprint unless Mike explicitly overrides.

## Sprint outcome

Primary win condition: one qualified customer action inside 48 hours.

Acceptable customer actions, in order:
1. Paid invoice / deposit / subscription.
2. Signed pilot agreement or written commitment with start date.
3. Booked sales call with a named buyer who has a real problem and budget.
4. Explicit warm intro to a buyer with a scheduled follow-up.

If none happen by hour 48, close with a ranked list of the top 10 prospects, all outreach sent, responses, blockers, and the single best next offer.

## Board shape

Use one Paperclip project/label: `48h Revenue Sprint`.

Columns:
- `Intake`: raw leads, offers, target accounts, and Mike-only decisions.
- `Ready`: fully actionable cards with owner, prospect segment, output, and due time.
- `Doing`: max one active card per agent.
- `Waiting on Human`: only for Mike-only actions such as sending from personal inbox, payment, licensed review, CAPTCHA, or approval.
- `Follow-up`: contacted or drafted items with a next follow-up time.
- `Won / Closed`: paid, booked, committed, declined, dead, or replaced.

WIP limits:
- Chief of Staff: 1 orchestration card + 1 blocker card.
- Revenue Follow-Up Agent: 3 active prospect cards.
- Content Producer: 1 offer/distribution card.
- Dev Operator: 1 evidence/enablement card.
- Server Mechanic: 1 reliability/watch card.
- Obsidian Librarian: 1 source-of-truth card.
- Bullbot Market Scout: only participates if its output can create a customer/revenue conversation within 48 hours.

## Agent owners and concrete outputs

### Chief of Staff - sprint captain

Owns cadence, triage, and board hygiene.

Card: `REV-000: Run 48h revenue sprint command loop`
- Output: concise status post every checkpoint with current best path to first customer.
- Due: every 4 hours while awake/available.
- Close when: final 48h closeout is posted and every card has final status.

Tasks:
- Keep only revenue-generating work in `Doing`.
- Convert vague tasks into owner + output + due time.
- Move blocked cards to `Waiting on Human` with a single clear ask for Mike.
- Kill or replace any card that cannot plausibly create a customer action within 48 hours.

### Revenue Follow-Up Agent - primary closer

Owns direct lead/prospect movement.

Card: `REV-001: Work warmest life-insurance / service leads to booked call or close`
- Output: lead table with name/channel/status/next action; outreach drafts; Mike-only asks separated.
- Due: first pass by hour 4; follow-up queue by hour 24; final by hour 48.
- Close when: each lead is `booked`, `quoted`, `follow-up scheduled`, `dead`, or `needs Mike`.

Card: `REV-002: Build and send/prepare 20-prospect quick offer list`
- Output: 20 named prospects, one sentence pain hypothesis each, recommended channel, exact message draft.
- Due: list by hour 6, first 10 outreach drafts by hour 8, all 20 by hour 24.
- Close when: 20 prospects have a sent/drafted status and next follow-up time.

Card: `REV-003: Same-day follow-up and objection log`
- Output: response tracker with objections, next reply, and decision needed.
- Due: refresh at every 4-hour checkpoint after outreach starts.
- Close when: every live response has a next reply or is marked dead.

### Content Producer - offer packaging and distribution

Owns making the offer clear enough to send today.

Card: `REV-010: Package the 48h offer into one sendable asset`
- Output: one short offer page/message: problem, result, who it is for, price/CTA, proof or credibility, booking/payment next step.
- Due: hour 3.
- Close when: Revenue Follow-Up Agent can paste/send it without further editing.

Card: `REV-011: Create 3 channel-specific outreach variants`
- Output: DM version, email version, intro-request version.
- Due: hour 5.
- Close when: variants are attached to the board and used by REV-002.

### Obsidian Librarian - source of truth

Owns pulling only active customer/revenue context from notes.

Card: `REV-020: Extract active revenue leads and commitments from Obsidian`
- Output: list of active leads, prior promises, warm contacts, service ideas, dead/gated items, and source note path.
- Due: hour 2.
- Close when: every extracted item has a destination card or is explicitly discarded.

Card: `REV-021: Write sprint closeout back to Obsidian`
- Output: one durable closeout note: what was tried, who responded, next follow-ups, revenue result.
- Due: hour 48.
- Close when: note path is linked from REV-000.

### Dev Operator - enablement only, no product shipping

Owns removing technical friction for selling.

Card: `REV-030: Verify demo / signup / payment / booking path`
- Output: tested buyer path with exact link(s), screenshots if useful, and any broken steps noted.
- Due: hour 4.
- Close when: seller has one safe link or one explicit fallback CTA.

Card: `REV-031: Draft technical proof points for outreach`
- Output: 5 bullets explaining what Paperclip/agent company can do today, written for buyers not engineers.
- Due: hour 6.
- Close when: Content Producer has used or rejected each bullet.

### Server Mechanic - reliability watch

Owns keeping Paperclip/Hermes usable during sprint.

Card: `REV-040: Keep sprint board and agent loop healthy`
- Output: checkpoint health note: board reachable, agents updating, no stuck runner blocking revenue tasks.
- Due: every 8 hours or on incident.
- Close when: sprint ends with no unresolved board/agent reliability blocker.

Rule: do not spend more than 30 minutes on non-revenue infrastructure unless Paperclip itself is down.

### Bullbot Market Scout - optional revenue scout

Only active if there is a buyer path today.

Card: `REV-050: Identify whether Bullbot can create a same-day buyer conversation`
- Output: 5 target buyer/user profiles and one concrete paid pilot angle, or recommendation to park Bullbot for this sprint.
- Due: hour 6.
- Close when: either handed to Revenue Follow-Up Agent as prospects or parked as non-48h revenue.

## 48-hour cadence

### Hour 0 kickoff, 15 minutes

Chief of Staff posts:
- sprint goal;
- current best offer;
- top 3 revenue paths;
- owners for REV-000, REV-001, REV-010, REV-020, REV-030, REV-040;
- first checkpoint time.

Closeout requirement for kickoff: all cards in `Ready` have owner, due time, output, and customer-action tie.

### Hour 2 source sweep

Obsidian Librarian delivers active revenue source list.
Chief of Staff deletes/parks non-revenue items.
Revenue Follow-Up Agent picks top warm leads.

Decision rule: if a lead cannot be contacted or advanced in 48h, park it.

### Hour 4 buyer path check

Dev Operator verifies the CTA path.
Revenue Follow-Up Agent delivers first warm lead statuses.
Content Producer delivers draft offer.
Chief of Staff posts the first checkpoint.

Decision rule: no outreach waits for perfect copy. If CTA path is imperfect, use booking call as fallback.

### Hour 8 first outbound batch

Revenue Follow-Up Agent has 10 prospects sent or ready for Mike to send.
Content Producer has channel variants attached.
Chief of Staff escalates only the smallest Mike-only asks.

Decision rule: any card still vague gets rewritten or closed.

### Hour 24 midpoint

Required outputs:
- 20 prospects sent/drafted.
- every warm lead has a status.
- follow-up times are scheduled.
- best-performing message identified.
- top 5 next prospects selected.

Decision rule: double down on the path with replies; stop paths with zero signal unless they are already queued.

### Hour 36 conversion push

Revenue Follow-Up Agent works all replies toward booked call / quote / payment.
Chief of Staff posts exact Mike asks, no more than 3.
Content Producer drafts objection replies.

Decision rule: only ask Mike to do actions that directly advance a named prospect.

### Hour 48 final closeout

Chief of Staff closes sprint with:
- win condition result;
- customer actions achieved;
- revenue or pipeline value;
- contacted prospects count;
- response count;
- booked calls / quotes / commitments;
- dead or parked items;
- next 24h follow-up list;
- what to change before next sprint.

Obsidian Librarian writes durable closeout note and links it.

## Card template

Use this exact shape for every revenue sprint card:

Title: `REV-###: verb + customer/revenue object`

Description:
- Goal: one sentence customer action.
- Owner: one agent.
- Due: exact hour/checkpoint.
- Output: concrete artifact or status table.
- Inputs: links/leads/notes needed.
- Mike-only ask: yes/no; if yes, one sentence.
- Closeout: what status/comment proves done.

Labels:
- `48h Revenue Sprint`
- `revenue`
- one of `lead`, `offer`, `outreach`, `follow-up`, `enablement`, `ops`

## Closeout rules

A card cannot be closed with `done` unless it has:
1. Final status: `won`, `booked`, `sent`, `scheduled`, `dead`, `parked`, or `needs Mike`.
2. Output artifact attached or pasted.
3. Next action owner and time, unless dead/parked.
4. Evidence: contact sent, prospect list, quote path, booking link, note path, or health check.

Blocked card rule:
- Move to `Waiting on Human` only when the next action is truly human-only.
- The blocker comment must be one sentence beginning: `Mike ask:`.
- If the ask is not resolved by the next checkpoint, Chief of Staff chooses a fallback path instead of waiting.

No zombie card rule:
- Any card untouched for 8 hours is closed, reassigned, or rewritten by Chief of Staff.

No research-only rule:
- Research must produce a named prospect, message, offer improvement, buyer insight, or kill recommendation.

No engineering detour rule:
- Engineering work is limited to confirming the sales path and reliability. Product fixes are parked unless they unblock an active named prospect.

## Minimal seed set

Create only these cards at kickoff:

1. `REV-000: Run 48h revenue sprint command loop` - Chief of Staff.
2. `REV-001: Work warmest life-insurance / service leads to booked call or close` - Revenue Follow-Up Agent.
3. `REV-002: Build and send/prepare 20-prospect quick offer list` - Revenue Follow-Up Agent.
4. `REV-010: Package the 48h offer into one sendable asset` - Content Producer.
5. `REV-020: Extract active revenue leads and commitments from Obsidian` - Obsidian Librarian.
6. `REV-030: Verify demo / signup / payment / booking path` - Dev Operator.
7. `REV-040: Keep sprint board and agent loop healthy` - Server Mechanic.
8. `REV-050: Identify whether Bullbot can create a same-day buyer conversation` - Bullbot Market Scout; close by hour 6 if not useful.

Do not seed more until one of these produces a lead, reply, or blocker.

## First-customer bias

When choosing between tasks, pick the one closest to money:
1. Existing warm lead.
2. Existing customer-like relationship.
3. Direct buyer with urgent pain.
4. Partner/referrer who can introduce buyer today.
5. Cold prospect.
6. Content or infrastructure.

If an agent has no task after a checkpoint, assign them to improve the highest-ranked active customer path, not to start a new project.
