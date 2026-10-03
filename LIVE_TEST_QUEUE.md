# Live Test Queue

This queue is append-only evidence planning for merged slices that still require a real user live test. A queued slice is **not VERIFIED** until the user performs the listed installed-client test and supplies the resulting logs/evidence.

## Queue order

1. Slice 3.2 – Move / XMove – `v0.1.0-alpha.22`
2. Slice 3.3 – Attack – `v0.1.0-alpha.23`
3. Slice 3.4 – Skills – `v0.1.0-alpha.24`
4. Slice 3.5 – Loot / Consumables – `v0.1.0-alpha.29`

> Current execution gate (2026-10-03): Slice 3.2 failed its first real Move attempt on alpha.22. Retest Slice 3.2 on correction release `v0.1.0-alpha.25` and require PASS before beginning Slice 3.3.

---

## Slice 3.2 – Move / XMove

**Status: VERIFIED**

- Release version: `v0.1.0-alpha.22`
- Update from: `v0.1.0-alpha.21`
- Character/class: any normal connected character; use a character standing in an open, low-risk area
- Server: the user's normal selected Adventure Land server
- Safety boundary: only the fixed 32-unit dashboard controls are allowed; do not use external scripts or repeated clicking
- Expected mutation path: Dashboard → central Action Gateway → geometry validation → official `move` socket event
- XMove scope in this slice: direct path only; if pathfinding would be needed, the request must fail with `XMOVE_PATH_REQUIRED` and send no movement packet

### Live attempt 1 – FAILED / correction retest required

- Windows client: `0.1.0-alpha.22`
- Account/server/character: connected successfully on EU II with `My_Ranger1`
- Start position: `main` at `(-1272.1555957426249, -32.26522650442442)`
- Move request: `act-52ffce2f-9b0f-47fd-b11d-e984384e34b4`
- Gateway result: `character.move`, `origin:"dashboard"`, `outcome:"success"`, duration 3 ms
- Real result: no position change was observed after the request; this is an explicit FAIL condition
- Diagnostic export: `Secrets sanitized: yes`
- XMove: not attempted after the Move failure
- The archived alpha.22 installer was installed manually, so the historical alpha.21 → alpha.22 automatic update step remains CI-only evidence, not a completed real-user update-path check.

Correction PR #52 targets `0.1.0-alpha.25`. The correction carries `new_map.m` into movement state and requires live server position progress before a Move/XMove request can return success. A silently ignored packet must return `MOVE_NOT_CONFIRMED`.

**Correction retest rule:** use installed `0.1.0-alpha.25`; repeat the bounded Move success test first. Only if Move changes the real live position and reports server confirmation should XMove be tested. Slice 3.3 must not begin until the corrected Slice 3.2 test passes.

### Live attempt 2 – alpha.25 FAILED / observation fix retest required

- Windows client: `0.1.0-alpha.25`
- Automatic updater/restart into alpha.25: observed successfully
- Account/server/character: connected successfully on EU II with `My_Ranger1`
- Start/observed position during the attempts: `main` at `(-1272.1555957426249, -64.26522650442442)`
- Four bounded `character.move` requests were recorded:
  - `act-2ee493f0-0fc6-45a0-8dea-4d4d17beecb0`
  - `act-ae02f2c2-6b09-4c23-a257-b7b4652d7b36`
  - `act-71092021-7299-4939-8c9f-f660b3f4336d`
  - `act-49ca4d17-cdcb-44e8-aa54-d218f87ed26c`
- Every request used `origin:"dashboard"` and correctly returned `MOVE_NOT_CONFIRMED` after roughly 1.1 seconds.
- No observed position change occurred; therefore Move still did not satisfy the behavioral PASS criteria.
- Diagnostic export: `Secrets sanitized: yes`
- XMove: not attempted because Move still had not passed.

PR #54 targets `0.1.0-alpha.26`. It requests Adventure Land's official read-only `send_updates` snapshots immediately and after 250/650/1000 ms following a bounded Move/XMove packet, retains server entity movement fields, and still requires real positional progress before success.

**Current correction retest rule:** update to installed `0.1.0-alpha.26` and perform exactly one bounded Move attempt first. Do not test XMove or Slice 3.3 unless that Move changes the real live position and is server-confirmed.

### Live attempt 3 – alpha.26 server-confirmed / canonical state still FAILED

- Windows client: `0.1.0-alpha.26`
- Automatic updater/restart into alpha.26: observed successfully
- Account/server/character: connected successfully on EU II with `My_Ranger1`
- Canonical position exposed during the captured attempts: `main` at `(-1225.4472875234312, -42.474173958785244)`
- Four bounded dashboard `character.move` requests were recorded:
  - `act-09673a4b-7724-479c-b8db-edc833878f7a` – success, 275 ms
  - `act-78720058-9a10-4ec0-be85-2dd5b401d129` – success, 681 ms
  - `act-ad8e9159-d1be-41dc-93ad-48eb6965c770` – success, 673 ms
  - `act-85e4dacb-ca13-4ddd-bd49-7e784b98bdc3` – success, 675 ms
- Every request used `origin:"dashboard"` and passed the alpha.26 authoritative server-observation gate.
- The canonical dashboard/diagnostic character `x/y` remained unchanged across the captured log. Therefore Slice 3.2 still does not satisfy its visible live-position PASS criterion.
- Diagnostic export: `Secrets sanitized: yes`
- XMove: not attempted because the canonical Move state still had not passed.
- The retest instruction called for exactly one Move; the supplied log contains four. Treat them as bounded failure evidence only, not as a PASS.

PR #56 targets `0.1.0-alpha.27`. It synchronizes the authenticated own-player entity snapshot back into the canonical connected-character state so a server-observed movement must also become visible in `liveState.character.x/y`.

CI note: the original PR #56 Linux jobs on `ubuntu-22.04` remained queued without a runner or executed steps. Ubuntu 22.04 entered GitHub-hosted runner deprecation on 2026-09-17. PR #56 pins Linux CI to `ubuntu-24.04`; the replacement Ubuntu verify and Linux installer smoke started normally and passed in CI run `37109436866`.

**Current correction retest rule:** update to installed `0.1.0-alpha.27`. Perform exactly **one** bounded Move attempt first. Require both `outcome:"success"` and an actual canonical live `x/y` change. Only then perform exactly one direct-path XMove. Do not begin Slice 3.3 until both pass.

### Live attempt 4 – alpha.27 canonical movement reached target / late rollback FAILED

- Windows client: `0.1.0-alpha.27`
- Automatic updater/restart into alpha.27: observed successfully
- Diagnostic export: `Secrets sanitized: yes`
- A pre-connect dashboard Move correctly failed with `CHARACTER_NOT_CONNECTED`; it is guard evidence only and is not counted as the movement attempt.
- Headless character: `My_Ranger1` connected on EU II at `main (-1193.4472875234312, -42.474173958785244)`
- One bounded post-connect Move request: `act-79e98b75-ef51-402f-9d88-c5077035cb48`
- Gateway result: `character.move`, `origin:"dashboard"`, `outcome:"success"`, duration 281 ms
- Canonical live position visibly advanced:
  - start y: `-42.474173958785244`
  - observed intermediate y: `-30.26117455512309`
  - exact 32-unit target y: `-10.474173958785244`
- A later in-flight own-player entity snapshot rolled canonical y back to `-30.26117455512309`; that rollback remained visible through the end of the captured log.
- Therefore Move is not yet a stable behavioral PASS even though the target was reached and canonical movement synchronization is now proven.
- XMove: not attempted because stable Move had not passed.

PR #58 targets `0.1.0-alpha.28`. It keeps moving entity snapshots for server confirmation but prevents any own-player snapshot with `moving:true` from overwriting canonical `character.x/y`. Direct player updates and non-moving entity snapshots may still advance canonical position.

**Current correction retest rule:** update to installed `0.1.0-alpha.28`. Perform exactly **one** bounded Move attempt. Require `outcome:"success"`, a canonical live position change toward the 32-unit target, and no subsequent rollback to an older in-flight position. Only if that remains stable should exactly one direct-path XMove be tested. Do not begin Slice 3.3 until both pass.

### Live attempt 5 – alpha.28 VERIFIED

- Windows client: `0.1.0-alpha.28`
- Automatic updater/restart into alpha.28: observed successfully
- Diagnostic export: `Secrets sanitized: yes`
- Headless character: `My_Ranger1` on EU II
- Move start: `main (168, -134)`
- Move request: `act-7a255dec-8779-49a2-8890-4e0b89dd56d7`
- Move gateway result: `character.move`, `origin:"dashboard"`, `outcome:"success"`, 334 ms
- Stable Move result: `main (168, -102)`, exactly 32 units from start; no later rollback in the captured log
- Direct-path XMove start: `main (168, -102)`
- XMove request: `act-4abd98ad-837b-4f10-9c77-0233e65c2488`
- XMove gateway result: `character.xmove`, `origin:"dashboard"`, `outcome:"success"`, 329 ms
- XMove observed intermediate: `main (168, -82.01300097592767)`
- Stable XMove result: `main (168, -70)`, exactly 32 units from start
- No rollback to the old position was present through the end of the supplied XMove log.
- No autonomous/repeated movement, unexpected map change, crash, disconnect, or unsanitized secret was observed.
- Result: Move PASS + direct-path XMove PASS. Slice 3.2 is VERIFIED on the corrected alpha.28 release.

**ROADMAP gate:** Slice 3.3 Attack is now unblocked. Continue strictly with exactly one bounded Attack live test before any later slice.

### Original alpha.22 dashboard steps retained for historical test intent

1. Start from installed `0.1.0-alpha.21`, choose **Install update**, and confirm the client restarts into `0.1.0-alpha.22`.
2. Connect the account, select the intended server, and start exactly one headless character.
3. In the character live state, record the starting map and position.
4. In **Action Gateway → Movement test controls**, leave **Movement mode = Move**.
5. Choose a direction with visibly open space and click that direction exactly once.
6. Record the displayed request ID/outcome and the updated character position.
7. Change **Movement mode = XMove**.
8. Again choose a direction with visibly open space and click exactly once.
9. Record the second request ID/outcome and the updated character position.
10. Use **Copy full log** and preserve the complete sanitized diagnostic log.

### Expected visible behavior

- Each successful click moves the character a small fixed step on the same map.
- The live character position changes after a successful action.
- Move reports action `character.move`; XMove reports action `character.xmove`.
- Both actions use `origin:"dashboard"` and the current canonical character ID.
- Each action has its own `act-…` request ID and correlated gateway start/completion records.
- The normal movement rate guard remains active.
- If the chosen XMove direction cannot be traversed directly, the action returns `XMOVE_PATH_REQUIRED` without moving the character. Pick another open direction for the success case.
- The diagnostic export still reports `Secrets sanitized: yes`.

### PASS

Slice 3.2 can later be marked VERIFIED only when the supplied live evidence shows all of the following:

- installed client is `0.1.0-alpha.22`
- automatic restart after the explicit update installation succeeds
- one real Move succeeds through the dashboard and changes live position
- one real XMove direct-path action succeeds through the dashboard and changes live position
- request IDs, origin, character ID, result/outcome, and correlated logs are present
- no movement bypass or arbitrary action endpoint is used
- full diagnostic log is sanitized

### FAIL / stop conditions

Treat the live test as failed and stop further movement testing if any of these occur:

- a success outcome is reported but the live position does not change
- the character moves without an `act-…` request ID / gateway correlation
- a clear open direction is rejected repeatedly with an unexpected error
- a blocked/pathfinding XMove mutates the character instead of returning `XMOVE_PATH_REQUIRED`
- the character changes map unexpectedly
- repeated or autonomous movement starts
- the client crashes/disconnects because of the action
- any secret, auth token, or password appears in copied logs

### After this test

Preserve the full log and the two request IDs. Then proceed to the next release in this queue if one has been published; do not wait for Slice 3.2 to be marked VERIFIED before testing later prepared releases.

> 2026-10-03 execution override: testing is performed strictly in ROADMAP order. Slice 3.2 passed on alpha.28 with one stable 32-unit Move and one stable direct-path 32-unit XMove, so Slice 3.3 Attack is now the next permitted live test. The original alpha.22 update-path requirement remains historical/CI evidence and is not retroactively claimed as a live pass.


---

## Slice 3.3 – Attack

**Status: MERGED – AWAITING USER TEST**

- Release version: `v0.1.0-alpha.23`
- Update from: `v0.1.0-alpha.22`
- Character/class: any normal combat-capable connected character
- Server: the user's normal selected Adventure Land server
- Target: one low-risk visible monster that is already within normal basic-attack range
- Safety boundary: exactly one manual dashboard attack for the success case; do not enable loops or repeated clicking
- Expected mutation path: Dashboard → central Action Gateway → visible-target/range/cooldown validation → official `attack` socket event → correlated Adventure Land `game_response`
- No automatic target selection or combat loop is part of Slice 3.3

### Dashboard steps

1. Start from installed `0.1.0-alpha.22`, choose **Install update**, and confirm the client restarts into `0.1.0-alpha.23`.
2. Connect the account, select the intended server, and start exactly one headless character.
3. Move the character manually in Adventure Land if necessary so one harmless monster is already clearly within the character's normal attack range.
4. In the live **Nearby entities** state, identify that visible monster and note its displayed monster ID/type.
5. In **Action Gateway → Attack test controls**, select that exact visible monster.
6. Click **Attack selected monster** exactly once.
7. Record the displayed request ID, outcome, target, range/distance result, and any cooldown result.
8. Confirm the monster was actually attacked in Adventure Land and that the dashboard request completed only after the server response.
9. After the first attack, wait for cooldown to expire before any optional second validation. Do not spam the button.
10. Use **Copy full log** and preserve the complete sanitized diagnostic log.

### Expected visible behavior

- The dashboard only offers monsters currently present in the live entity state; arbitrary player/monster IDs are not accepted through the UI.
- A successful request reports action `character.attack`, `origin:"dashboard"`, the current canonical character ID, and a unique `act-…` request ID.
- The selected target remains the exact monster ID shown in live state.
- The preflight result confirms the target is visible/alive/on-map and within the current character range.
- The gateway request remains pending until Adventure Land answers the `attack` action through its server response.
- A successful server response ends with `outcome:"success"` and `serverAccepted:true`.
- If cooldown is active, the request fails as `ATTACK_COOLDOWN`; when the server supplies remaining cooldown, `retryAfterMs` is surfaced.
- If the monster moves out of range or disappears before the click, the action is rejected instead of blindly attacking.
- The diagnostic export still reports `Secrets sanitized: yes`.

### PASS

Slice 3.3 can later be marked VERIFIED only when the supplied live evidence shows all of the following:

- installed client is `0.1.0-alpha.23`
- automatic restart after the explicit alpha.22 → alpha.23 update succeeds
- one real visible monster is selected from live state and attacked successfully through the dashboard
- the real Adventure Land character performs the attack against that same monster
- request ID, `origin:"dashboard"`, character ID, target ID, outcome/result, and correlated gateway logs are present
- the successful gateway request completes from the Adventure Land server response, not merely from sending the socket packet
- cooldown/result handling is visible and no uncontrolled repeat attack occurs
- full diagnostic log is sanitized

### FAIL / stop conditions

Treat the live test as failed and stop further combat testing if any of these occur:

- a success outcome is reported but no real attack occurs
- the wrong monster/player is attacked
- the action is accepted for a target that is no longer visible or is clearly out of range
- the dashboard allows arbitrary target IDs outside the visible-monster selection
- multiple attacks fire from a single click
- attacks continue automatically after the manual request
- a cooldown rejection is hidden/misreported as success
- the request completes before any server acceptance/rejection is observed
- the client crashes/disconnects because of the action
- any secret, auth token, or password appears in copied logs

### After this test

Preserve the full log and the attack request ID. Then proceed to later queued releases if available; Slice 3.3 remains AWAITING USER TEST until this evidence is reviewed.


---

## Slice 3.4 – Skills

**Status: MERGED – AWAITING USER TEST**

- Release version: `v0.1.0-alpha.24`
- Update from: `v0.1.0-alpha.23`
- Character/class: use a connected character for which the dashboard exposes at least one simple non-hostile supported skill
- Server: the user's normal selected Adventure Land server
- Safety boundary: select only a skill offered by the dashboard and click **Use selected skill once** exactly once for the success case
- Expected mutation path: Dashboard → central Action Gateway → `G.skills`/class/level/MP/target/range/cooldown validation → official `skill` socket event → correlated Adventure Land `game_response`
- Excluded by design: hostile, movement, special-argument, item-consuming, multi-target, passive, global, unsupported-target-shape, and arbitrary skill payloads

### Dashboard steps

1. Start from installed `0.1.0-alpha.23`, choose **Install update**, and confirm the client restarts into `0.1.0-alpha.24`.
2. Connect the account, select the intended server, and start exactly one headless character.
3. Open **Action Gateway → Skill test controls**.
4. Confirm **Safe skill** lists only skills valid for the connected character and that no free-form skill-name or payload field is present.
5. Select one low-risk non-hostile skill offered by the dashboard. Prefer a no-target self/buff/utility skill where available; otherwise use only a visible in-range target offered by **Skill target**.
6. Note the selected skill name, displayed MP cost, target mode, range (if shown), and target ID/name (if required).
7. Click **Use selected skill once** exactly once.
8. Record the request ID, outcome, skill, target (if any), cooldown result, and server-accepted result.
9. Confirm the real Adventure Land character performs that same skill once and no hidden repeat action starts.
10. Use **Copy full log** and preserve the complete sanitized diagnostic log.

### Expected visible behavior

- Only backend-approved simple non-hostile skills derived from loaded `G.skills` are selectable.
- The UI does not expose arbitrary JSON, free-form socket payloads, or a generic action endpoint.
- Targeted skills only offer currently visible in-range targets of the required kind.
- A successful request reports action `character.skill`, `origin:"dashboard"`, the current canonical character ID, and a unique `act-…` request ID.
- The gateway request remains pending until Adventure Land returns the matching skill `game_response`.
- A successful response ends with `outcome:"success"` and `serverAccepted:true`.
- If cooldown is active, the request fails as `SKILL_COOLDOWN`; when remaining cooldown is available, `retryAfterMs` is surfaced.
- MP, level, dead-state, target, and range validation failures must reject before mutation.
- The diagnostic export still reports `Secrets sanitized: yes`.

### PASS

Slice 3.4 can later be marked VERIFIED only when the supplied live evidence shows all of the following:

- installed client is `0.1.0-alpha.24`
- automatic restart after the explicit alpha.23 → alpha.24 update succeeds
- one real supported skill is selected from the bounded dashboard list and executes exactly once
- the real Adventure Land character performs that same skill
- request ID, `origin:"dashboard"`, character ID, skill name, target details when applicable, outcome/result, and correlated gateway logs are present
- the successful gateway request completes from the matching Adventure Land server response, not merely from sending the socket packet
- no excluded or arbitrary skill payload is exposed through the dashboard
- full diagnostic log is sanitized

### FAIL / stop conditions

Treat the live test as failed and stop further skill testing if any of these occur:

- a success outcome is reported but the real skill does not execute
- the wrong skill or wrong target is used
- a targeted skill can select an invalid, invisible, or clearly out-of-range target
- the dashboard exposes free-form arbitrary skill/socket payload controls
- one click causes multiple skill uses or a hidden skill loop
- a cooldown/MP/level/target rejection is hidden or misreported as success
- the request completes before any matching server acceptance/rejection is observed
- the client crashes/disconnects because of the skill action
- any secret, auth token, or password appears in copied logs

### After this test

Preserve the full log and the skill request ID. Slice 3.4 remains AWAITING USER TEST until this evidence is reviewed.

---

## Append-only result — Slice 3.3 Attack — 2026-10-03

**Status: VERIFIED on Windows with installed `0.1.0-alpha.28`. Do not begin Slice 3.4 until this docs PR is merged and the exact post-merge main CI is green.**

- Character: `My_Ranger1` / `CH_denPIHA05KxLLQqVOad9h9vr9KPrL`, EU II.
- Diagnostic export: `Secrets sanitized: yes`.
- Historical guard attempt: `act-4762192d-52bb-4b30-bf3d-6b4207200b0b` correctly failed `ATTACK_OUT_OF_RANGE` at `576.4 > 142.0`; no false success.
- PASS request: `act-ab766aa5-32fb-46b2-b0c0-ffeccfe4e628`.
- Action: `character.attack`; origin: `dashboard`.
- Selected monster: ID `4990598`, type `goo`.
- Distance/range: `119.7 / 142`.
- Adventure Land server confirmation: `serverAccepted:true`; cooldown `1045 ms`.
- Gateway completion: `outcome:"success"`, duration `15 ms`.
- Live target switched to `4990598`; XP increased `20310734 → 20311229` after the attack.
- Exactly one attack request was produced by the successful manual click; no follow-up `character.attack` request appeared through log end `2026-10-03T09:21:10.153Z`.
- No automatic combat loop, crash, disconnect, or secret exposure was observed.

**Gate result: Slice 3.3 VERIFIED. Slice 3.4 Skills remains blocked pending merge of this documentation and green post-merge main CI.**


---

## Append-only result — Slice 3.4 Skills — 2026-10-03

**Status: VERIFIED on Windows with installed `0.1.0-alpha.28`.**

- Character: `My_Ranger1` / `CH_denPIHA05KxLLQqVOad9h9vr9KPrL`, EU II.
- Diagnostic export: `Secrets sanitized: yes`.
- User selected the bounded Safe skill `Track` / `track`, displayed as `80 MP` with `1600 ms` cooldown.
- PASS request: `act-b17ad8fc-b150-403d-b0f8-48e3161b1708`.
- Action: `character.skill`; origin: `dashboard`.
- Live MP changed `868 → 788`, matching `mpCost:80` exactly.
- Adventure Land server confirmation: `skillName:"track"`, `mpCost:80`, `cooldownMs:1541`, `serverAccepted:true`.
- Gateway completion: `outcome:"success"`, duration `88 ms`.
- Exactly one skill request was produced by the successful manual click; only its start/server-confirmation/completion records occur in the complete diagnostic log.
- No hidden repeat skill, crash, disconnect, or secret exposure was observed through log end `2026-10-03T09:34:51.660Z`.

**Gate result: Slice 3.4 VERIFIED.**

---

## Slice 3.5 – Loot / Consumables

**Status: MERGED – AWAITING USER TEST**

- Release version: `v0.1.0-alpha.29`
- Update from installed client: `v0.1.0-alpha.28`
- Release target SHA: `bfdfa7cd48eeaccf2a2901990476064777c35d3b`
- Feature PR: #63; release-runner correction: #64
- Publish workflow: `37115894376` – Linux success, Windows success, release success
- Safety boundary: only select entries offered by **Loot & consumable test controls**. No free-form chest/item/socket payload and no repeated clicking.
- Expected loot path: live Adventure Land `drop` → dashboard visible-chest option → central Action Gateway → `open_chest {id}` → matching `chest_opened`.
- Expected consumable path: exact current inventory slot + current game-data HP/MP validation → central Action Gateway → `equip {num, consume:true}` → Adventure Land `game_response place:"equip"`.
- Excluded by design: auto-loot, auto-potion, farming loops, arbitrary inventory indices/item names, mixed-resource/non-HP/MP items, hidden/repeated actions, and generic socket payloads.

### Test A – one HP/MP consumable

1. Update the installed Windows client from `0.1.0-alpha.28` to `0.1.0-alpha.29` with **Install update** and confirm the automatic restart.
2. Connect the normal account/server and start exactly one headless character.
3. Open **Action Gateway → Loot & consumable test controls**.
4. Confirm **HP/MP consumable** lists only actual current inventory items and that no free-form item ID/index/payload field exists.
5. Ensure the resource for the selected item is below maximum. Do not consume anything merely to create this condition if doing so would interfere with another live-test gate.
6. Select one low-value HP or MP consumable offered by the dashboard.
7. Note its displayed item name, resource kind, restore amount, quantity, inventory slot, and cooldown if shown.
8. Click **Use selected HP/MP item once** exactly once.
9. Record the `act-…` request ID and preserve the full sanitized diagnostic log.

PASS evidence for Test A must show:

- exactly one `character.consume` request with `origin:"dashboard"`
- current canonical character ID
- selected inventory index, item name, and `hp` or `mp` kind
- validation against the actual current inventory slot and current Adventure Land item data
- official `equip` payload uses that exact slot with `consume:true`
- completion occurs only after Adventure Land `game_response` for `place:"equip"`
- successful result reports `serverAccepted:true`
- item quantity decreases or the expected resource increases in subsequent live state when Adventure Land reports the mutation
- exactly one use from the one click; no auto-potion or hidden repeat
- cooldown/full-resource rejection is not masked as success
- `Secrets sanitized: yes`

### Test B – one visible loot chest

1. Obtain one normal low-risk loot chest through ordinary gameplay. The chest must first appear in the live state from Adventure Land; do not enter a chest ID manually.
2. Confirm **Visible loot chest** offers that current chest.
3. Select that offered chest.
4. Click **Loot selected chest once** exactly once.
5. Record the `act-…` request ID and preserve the full sanitized diagnostic log.

PASS evidence for Test B must show:

- the chest originated from a real Adventure Land `drop` event and was present in the bounded dashboard options
- exactly one `character.loot` request with `origin:"dashboard"`
- current canonical character ID and selected chest ID
- official `open_chest {id}` request uses exactly that selected visible chest
- completion occurs only after the matching `chest_opened` server event
- successful result reports `serverAccepted:true`
- the chest disappears from live chest options after server confirmation
- exactly one open from the one click; no auto-loot or hidden repeat
- an already-gone/non-visible chest is rejected rather than reported as success
- `Secrets sanitized: yes`

### FAIL / stop conditions

Stop Slice 3.5 testing and preserve the log if any of these occur:

- dashboard exposes arbitrary chest IDs, inventory indices, item IDs, JSON, or socket payload fields
- a non-current or changed inventory slot can still be consumed
- a non-HP/MP or mixed-resource item is offered or accepted
- full HP/MP or active cooldown is falsely reported as success
- one click causes multiple item uses or multiple chest opens
- loot succeeds without the chest having been present in current live state
- gateway reports success before the matching Adventure Land server confirmation
- auto-loot, auto-potion, or any farming loop starts
- client crashes/disconnects because of the action
- any secret/auth token/password appears in diagnostic output

### After these tests

Slice 3.5 remains **AWAITING USER TEST** until both Test A and Test B evidence are reviewed. CI and release publication alone must never mark it VERIFIED.



### Alpha.29 partial live result and alpha.30 correction

The alpha.29 consumable half has real PASS evidence, but the original manual loot preparation workflow is superseded for retest purposes.

Historical alpha.29 consumable evidence:

- request: `act-27dd4e7c-94aa-4715-977e-742704091af9`
- action/origin: `character.consume` / `dashboard`
- exact item: inventory slot 10, `mpot0` / MP Potion, `kind:"mp"`
- quantity before: 2584; configured restore: 300
- Adventure Land confirmation: `serverAccepted:true`
- Gateway: `outcome:"success"`, 20 ms
- live MP: `833 → 1065`
- diagnostic export: `Secrets sanitized: yes`

**Correction release: `v0.1.0-alpha.30` (publish only after correction PR merge and green post-merge main CI).**

For the alpha.30 retest the only normal user steps are:

1. While the current headless account/server/character session is active, click **Install update** for alpha.30 and wait for the automatic restart/reconnect.
2. Click **Start test** once in **Slice 3.5 one-click live test**.
3. When the test reaches `PASSED`, `BLOCKED`, or `FAILED`, paste the report that the dashboard automatically copied to the clipboard into ChatGPT.

Do **not** manually create/select a chest, attack or move for test preparation, select a potion, select a target, run individual Phase 3 test controls, or manually assemble a diagnostic log.

The alpha.30 harness must:

- restore the already active session/server/headless-character binding across the updater restart without persisting credentials;
- use fresh Adventure Land live state and current game data for every bounded preparation/action;
- prefer an already observed current headless-session chest;
- otherwise perform only its own bounded low-risk loot preparation;
- execute exactly one confirmed loot mutation for the selected/generated chest;
- select and execute exactly one validated HP/MP consumable mutation, creating a safe MP deficit itself when required;
- never blind-retry a possibly sent non-idempotent action;
- finish itself as `PASSED`, `BLOCKED`, or `FAILED`;
- automatically copy a structured result plus the complete sanitized diagnostic export to the clipboard.

Slice 3.5 remains **MERGED – AWAITING USER TEST** until the alpha.30 one-click report is reviewed. CI/release publication alone never makes it VERIFIED.


### Alpha.30 real one-click result: BLOCKED; alpha.31 bridge retest

Real alpha.30 report:

- test ID: `live35-6dded20e-78ce-45a8-a7e7-c4e13e87dd74`
- outcome: `BLOCKED`
- error: `LIVE_TEST_CHARACTER_NOT_CONNECTED`
- step: `preflight`
- no gameplay mutation occurred
- client: `0.1.0-alpha.30` / Windows
- diagnostic export: `Secrets sanitized: yes`

The report proves the updated one-click UI and automatic clipboard result path worked, but the source build for that update was alpha.29 and therefore could not create the new ephemeral session handoff that only exists starting with alpha.30.

**Target retest release: `v0.1.0-alpha.31`.**

The alpha.31 CI gate must prove:

1. detached updater environment survives source-process exit on Windows and Linux;
2. the real installer passes the handoff environment to the automatically restarted client;
3. the restarted client logs `present:true`, `consumed:true` for the injected non-secret probe;
4. an intentionally invalid probe logs `decoded:false` and is discarded;
5. the raw probe value never appears in structured client logs;
6. installer upgrade path is alpha.30 → alpha.31;
7. all existing Action Gateway and one-click live-test tests remain green.

For the real bridge retest, alpha.30 must have an active account/server/headless-character session before **Install update** can transfer it; the lost alpha.29 in-memory session cannot be recreated by software after the fact without re-authentication. This is a one-time bootstrap consequence of introducing the handoff in alpha.30, not the desired steady-state workflow.

After the bridge has an active source session, the user-facing retest returns to exactly:

```text
Install update
→ Start test
→ paste automatically copied report
```

Slice 3.5 remains **unverified** until the alpha.31 real report is reviewed.


### Alpha.31 real one-click result: PASSED — Slice 3.5 VERIFIED

Real live report:

- client: `0.1.0-alpha.31` / Windows
- test ID: `live35-2b341b26-64cd-4cec-95d4-b2d863bf4d48`
- character: `My_Ranger1` / `CH_denPIHA05KxLLQqVOad9h9vr9KPrL`
- server: EU II / `SR_EUII`
- outcome: `passed`
- complete diagnostic: 211 records, `Secrets sanitized: yes`

The update bridge succeeded end to end:

- session handoff `present:true`
- handoff `decoded:true`
- handoff `consumed:true`
- account restored from `update_handoff`
- EU II restored
- headless character restored automatically

The one-click harness then completed the full Slice 3.5 live chain itself:

- bounded setup attack: exactly one unique `character.attack` request, server accepted
- generated live chest: `qBf4PJTGWHhTKbv0fsfbnTlaqGFo1l`
- loot: exactly one unique `character.loot` request, `serverAccepted:true`, chest disappeared and gold changed
- consumable: exactly one unique `character.consume` request for slot 4 / `hpot0`, `serverAccepted:true`, HP `4168 → 4182`, quantity `7257 → 7256`
- no duplicate attack/loot/consume request IDs
- zero WARN/ERROR/FATAL records
- no crash/disconnect or hidden repeated mutation
- final log record: `Slice 3.5 one-click live test passed.`

**Canonical queue status: Slice 3.5 = VERIFIED.**

Do not repeat Slice 3.5 merely because its earlier alpha.29/alpha.30 queue entries remain as historical evidence. The next gameplay work may advance beyond Phase 3 only after this verification documentation is merged and post-merge `main` CI is fully green.


### Alpha.32 real one-click result: PASSED — Slice 4.1 VERIFIED

Real live report:

- client: `0.1.0-alpha.32` / Windows
- test ID: `live41-7df34dc6-b7e4-4f4d-8bdc-18f5a338da08`
- outcome: `passed`
- complete diagnostic: 28 records, `Secrets sanitized: yes`

The Slice 4.1 one-click harness completed the full isolated runtime chain:

- load/start: runtime reached `running` and script logs were emitted under `script:slice-4-1-live-timers`
- timer lifecycle: one active interval was observed before pause
- pause: status `paused`, active timers `0`, and log count remained `6 → 6` across the observation window
- restart/stop: restart returned to `running`, stop reached `stopped`, active timers `0`
- crash isolation: intentional `slice41-intentional-crash` reached `crashed` with `coreIsolated:true`
- recovery: a new script started after the crash, emitted the separately marked `slice41:recovered` log, then stopped cleanly
- final runtime: `stopped`, active timers `0`
- final test result: `Slice 4.1 one-click live test passed.`

The one expected ERROR record is the intentional crash-isolation probe and is positive test evidence.

**Canonical queue status: Slice 4.1 = VERIFIED.**

Do not repeat Slice 4.1 merely because earlier planning text remains as historical evidence. Slice 4.2 may start only after this verification documentation is merged and post-merge `main` CI is fully green.

---

### Alpha.37 real one-click result: PASSED — Slice 4.2 VERIFIED

Real live report:

- release: `v0.1.0-alpha.37`
- release target / tested implementation main: `503d320403c78f05f6d86f314de74f8172140609`
- client: `0.1.0-alpha.37` / Windows
- platform: `win32`
- test ID: `live42-cfa353b4-ed33-48b3-b979-6dfd0fce0c0c`
- character: `My_Ranger1` / `CH_denPIHA05KxLLQqVOad9h9vr9KPrL`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T15:26:54.970Z → 2026-10-03T15:26:59.214Z`
- diagnostic export: 148 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 4.2 chain:

- preflight selected low-risk crab `5218826`, HP `400`, attack `24`, distance `119.4`, with `targetWaitMs:0`;
- `character`, `G`, `Entities`, `get_nearest_monster()`, `is_in_range()`, and `can_attack()` all passed inside the isolated script;
- exactly one successful attack was recorded in the final structured result:
  - `act-e3e04fac-81be-4611-b1af-01d7e14d12e5`;
- loot completed:
  - `act-43609d07-0882-43d6-9fac-1cab838adb8a`;
- direct `move()` completed:
  - `act-83c55bfa-2665-4741-90a0-7420dfc76de5`;
- direct-path `xmove()` completed:
  - `act-d45b8815-fadc-477d-8829-83a7a7b4b1ff`;
- the structured report confirms these farmer mutations used script origin through the central Action Gateway;
- movement evidence reports `moveConfirmed:true` and `xmoveConfirmed:true`;
- all four terminal steps passed: `preflight`, `globals-and-helpers`, `script-farmer-actions`, and `script-movement`;
- final runtime state: `stopped`, `activeTimers:0`, with worker resources released cleanly.

Historical alpha.33 through alpha.36 reports remain append-only evidence of earlier BLOCKED/FAILED live conditions and the fixes they drove. They must not be rewritten as passes.

**Canonical queue status: Slice 4.2 = VERIFIED.**

Do not repeat Slice 4.2 merely because earlier failure reports remain as historical evidence. Slice 4.3 may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.

