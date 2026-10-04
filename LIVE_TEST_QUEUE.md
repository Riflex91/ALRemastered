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

---

### Alpha.39 real one-click result: PASSED — Slice 4.3 VERIFIED

Real live report:

- release: `v0.1.0-alpha.39`
- release target / tested implementation main: `e4c2ef7a2b894325f169baa6bcf1c1dee5913c5f`
- client: `0.1.0-alpha.39` / Windows
- platform: `win32`
- test ID: `live43-de9d8881-ebbc-4226-bfcb-f21cf811ac2c`
- character: `My_Ranger2`
- server: EU II / `SR_EUII`
- outcome: `passed`
- observed event: `entities`
- test window: `2026-10-03T16:44:22.546Z → 2026-10-03T16:44:24.632Z`
- diagnostic export: 51 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 4.3 chain:

- fresh server `entities` event reached the isolated worker as a safe snapshot;
- `off()` reduced active listeners to zero;
- read-only refreshes caused no callback after `off()` or stop;
- pause cleared listeners and the paused worker stayed silent;
- restart created a fresh run/listener and received fresh events;
- the intentional handler crash remained isolated from the connected core;
- final runtime: `stopped`, `activeEventListeners:0`, `activeTimers:0`;
- all five terminal steps passed.

The intentional `Slice 4.3 handler crash probe` ERROR is expected positive crash-isolation evidence.

Historical alpha.38 `BLOCKED` evidence remains valid and must not be rewritten: the old harness waited for `player` after `send_updates`, while the real server supplied refresh-backed `entities` events. Alpha.39 corrected the harness to observe the event actually produced by the read-only refresh.

**Canonical queue status: Slice 4.3 = VERIFIED.**

Do not repeat Slice 4.3 merely because the alpha.38 blocked report remains as historical evidence. Slice 4.4 may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.

---

### Alpha.40 real one-click result: PASSED — Slice 4.4 VERIFIED

Real live report:

- release: `v0.1.0-alpha.40`
- release target / tested implementation main: `a2e32a94e3da32413bfe994b18146be8b40a657a`
- client: `0.1.0-alpha.40` / Windows
- platform: `win32`
- test ID: `live44-28913d1c-0fe7-43a2-9f7d-bf71bfe94f09`
- outcome: `passed`
- test window: `2026-10-03T17:18:23.284Z → 2026-10-03T17:18:24.120Z`
- diagnostic export: 38 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 4.4 storage chain:

- `set()` persisted JSON state and `get()` returned it immediately;
- a fresh isolated worker restored the same script namespace from local disk;
- a secondary script using the same storage key started with an empty namespace and could not read or overwrite the primary script's state;
- the two script names mapped to separate hashed namespaces;
- `del()` removed persisted state;
- both bounded test namespaces finished empty;
- storage mutation logs explicitly used `valueLogged:false`;
- final runtime: `stopped`, `activeTimers:0`, `activeEventListeners:0`;
- all five terminal steps passed.

**Canonical queue status: Slice 4.4 = VERIFIED.**

Do not repeat Slice 4.4 merely because planning text remains above. Slice 4.5 may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.

---

### Alpha.42 real one-click result: PASSED — Slice 4.5 VERIFIED

Real live report:

- release: `v0.1.0-alpha.42`
- release target / tested implementation main: `c40b811658d83c05bdc8a9d4edbbe43253f2eb1f`
- client: `0.1.0-alpha.42` / Windows
- platform: `win32`
- test ID: `live45-dcfdcaea-dd09-4875-b642-75193c2b9284`
- character: `My_Ranger2`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T18:22:54.058Z → 2026-10-03T18:22:55.333Z`
- diagnostic export: 82 log lines, `Secrets sanitized: yes`

The one-click harness completed the Slice 4.5 live chain:

- automatically selected low-risk visible `crab` target `5330035`;
- target evidence: HP `400`, attack `24`, distance `22.3`;
- no preflight move was required in this run because the selected target was already in range: `approachMoveCount:0`;
- started the official Simple Farmer using bounded no-code Monster / HP / MP / Loot / Respawn configuration;
- one server-confirmed script-origin attack succeeded through the central Action Gateway:
  - `act-8a1035d5-5906-4d6e-add8-8c2e9689e962`;
- one server-confirmed script-origin loot succeeded through the central Action Gateway:
  - `act-fdcb5c96-8873-47ac-a1f3-c2cb9d0f6779`;
- structured result: `attackCount:1`, `lootCount:1`;
- final runtime: `stopped`, `activeTimers:0`, `activeEventListeners:0`;
- all five terminal steps passed.

Historical alpha.41 `BLOCKED` evidence remains valid: the earlier harness required a safe target to already be in range. Alpha.42 added bounded direct preflight approach through the existing MovementService / Action Gateway. This successful run did not require movement because its selected crab was already in range.

**Canonical queue status: Slice 4.5 = VERIFIED.**

Do not repeat Slice 4.5 merely because the earlier alpha.41 blocked report remains as historical evidence. Phase 5 / Slice 5.1 may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.

---

### Alpha.43 real one-click result: PASSED — Slice 5.1 VERIFIED

Real live report:

- release: `v0.1.0-alpha.43`
- release target / tested implementation main: `7a05b80c5be84425208e957a115d5964bdfbf8bc`
- client: `0.1.0-alpha.43` / Windows
- platform: `win32`
- test ID: `live51-f53397ab-161c-4cae-bc15-86eb02d314f9`
- character: `My_Merchant`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T18:46:50.249Z → 2026-10-03T18:46:51.492Z`
- diagnostic export: 26 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 5.1 heartbeat chain:

- Core heartbeat advanced `24 → 25`;
- Character heartbeat advanced `65 → 69` from real headless transport activity with `pingMs:13`;
- isolated Script heartbeat advanced `1 → 3` while `activeTimers:0`;
- final Character state later reported heartbeat sequence `78`;
- final Script runtime was `stopped`, `activeTimers:0`, `activeEventListeners:0`;
- no reconnect, restart/watchdog recovery, or gameplay mutation occurred;
- diagnostic completion evidence reported `gameplayMutation:false` and `recoveryAction:false`;
- all four terminal steps passed.

**Canonical queue status: Slice 5.1 = VERIFIED.**

Do not repeat Slice 5.1 merely because the planning text remains above. Slice 5.2 may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.

---

### Alpha.44 real one-click result: PASSED — Slice 5.2 VERIFIED

Real live report:

- release: `v0.1.0-alpha.44`
- release target / tested implementation main: `6f87ccaab851c1a8d134b9f0d7dc69c1808c10be`
- client: `0.1.0-alpha.44` / Windows
- platform: `win32`
- test ID: `live52-862cca46-3984-40fc-843b-8787b0e715ce`
- character: `My_Merchant` / `CH_wHJMcgKCsCoQxQbkCHx5rWQB3o3O7`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T19:16:39.025Z → 2026-10-03T19:16:39.875Z`
- diagnostic export: 295 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 5.2 recovery chain:

- preflight confirmed a connected character and no active script automation;
- unexpected close was detected as `socket_closed` with `reconnectAttempt:1`;
- first deterministic reconnect delay was `500 ms`;
- ordered recovery logs were confirmed:
  1. connection closed unexpectedly
  2. reconnect scheduled
  3. reconnect attempt started
  4. headless character reconnected
- `reconnectCount` increased `2 → 3`;
- `lastDisconnectAt` and `lastReconnectAt` were both populated;
- post-reconnect heartbeat advanced `708 → 709`;
- final character state was connected with a fresh heartbeat and `pingMs:12`;
- diagnostic completion evidence reported `gameplayMutation:false`;
- no gameplay mutation was performed.

Repository/release evidence:

- implementation PR #87 is merged at exact main `6f87ccaab851c1a8d134b9f0d7dc69c1808c10be`;
- post-merge CI run `37146892506` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- `release/v0.1.0-alpha.44` was verified commit-identical to the tested implementation main.

**Canonical queue status: Slice 5.2 = VERIFIED.**

Do not repeat Slice 5.2 merely because implementation/planning text remains elsewhere. Slice 5.3 may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.

---

### Alpha.45 real one-click result: PASSED — Slice 5.3 VERIFIED

Real live report:

- release: `v0.1.0-alpha.45`
- release target / tested implementation main: `4369e661692f0ffc6926eb38bebf115d2978aeac`
- client: `0.1.0-alpha.45` / Windows
- platform: `win32`
- test ID: `live53-e366a683-1782-4765-94df-89d98e339db9`
- character: `My_Rogue` / `CH_TQTrIfkU6DEnJBl0kXUArLVTw1ht6`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T19:51:17.664Z → 2026-10-03T19:51:18.063Z`
- diagnostic export: 74 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 5.3 recovery chain:

- real server-observed death evidence was present: `dead:true`, `deathCount:1`, `lastDeathAt:2026-10-03T19:51:10.444Z`;
- structured death log record 15 was present;
- the isolated recovery worker independently observed `character.rip` in log record 48;
- the worker invoked `character.respawn` through the script bridge and central Action Gateway;
- Action Gateway request `act-b04923c7-2a16-4a9f-8407-80196e8c3fbb` completed with `origin:"script"` and `outcome:"success"`;
- `respawnCount` advanced to `1`, with `lastRespawnAt:2026-10-03T19:51:17.948Z`;
- final Character state was alive: `dead:false`, `hp:1101/1101`, heartbeat `91`, `pingMs:20`;
- the script run ID stayed exactly `script-f1e730bb-a079-440e-87c8-1991f5098cc1` before and after respawn;
- continuation log record 72 confirmed `slice53:continued-after-respawn`;
- final runtime: `stopped`, `activeTimers:0`, `activeEventListeners:0`;
- completion evidence recorded the intended gameplay mutation `character.respawn` and `rawSocketAccess:false`.

Repository/release evidence:

- implementation PR #89 is merged at exact main `4369e661692f0ffc6926eb38bebf115d2978aeac`;
- exact post-merge main CI run `37148900780` completed with all four required jobs successful;
- release publish run `37149125597` completed successfully;
- `v0.1.0-alpha.45` targets the tested implementation commit and contains Windows installer, Linux installer, and updater manifest.

**Canonical queue status: Slice 5.3 = VERIFIED.**

Do not repeat Slice 5.3 merely because implementation/planning text remains elsewhere. Slice 5.4 may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.

---

### Alpha.46 real one-click result: PASSED — Slice 5.4 VERIFIED

Real live report:

- release: `v0.1.0-alpha.46`
- release target / tested implementation main: `6fe751cf94bd8e69f4726b85c7a35563658f8940`
- client: `0.1.0-alpha.46` / Windows
- platform: `win32`
- test ID: `live54-49181429-0f48-4118-b04d-fbdb8be54555`
- character: `My_Ranger1` / `CH_denPIHA05KxLLQqVOad9h9vr9KPrL`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T20:16:50.727Z → 2026-10-03T20:16:55.471Z`
- diagnostic export: 144 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 5.4 watchdog chain:

- the isolated Script probe established healthy heartbeat sequence `3` before fault injection;
- the host suppressed only observation of Script heartbeats through the bounded test-only hook;
- diagnostic record 96 detected a stale Script heartbeat at `1792 ms` against the `1500 ms` stale threshold;
- the first controlled Script restart completed in record 102 and changed the run ID;
- the second controlled Script restart completed in record 116;
- restart usage reached exactly `2/2`;
- diagnostic record 121 exhausted the restart budget with `noRestartLoop:true`;
- the result entered explicit `blocked:true`;
- over the explicit `1200 ms` guard window, restart count remained `2 → 2`;
- restart-start log count remained `2 → 2`;
- heartbeat observation was then restored;
- the Script budget was reset to `0`, with `blocked:false`;
- Core and Character remained healthy and required zero restarts;
- final Character remained connected/alive with heartbeat `172` and `pingMs:18`;
- final Script runtime was `stopped`, `activeTimers:0`, `activeEventListeners:0`;
- diagnostic completion evidence recorded `scriptRestarts:2`, `budgetLimit:2`, `restartLoopPrevented:true`, `gameplayMutation:false`, and `rawSocketAccess:false`.

Repository/release evidence:

- implementation PR #91 is merged at exact main `6fe751cf94bd8e69f4726b85c7a35563658f8940`;
- exact post-merge main CI run `37150612046` completed with all four required jobs successful;
- release publish run `37150759804` completed successfully;
- `v0.1.0-alpha.46` targets the tested implementation commit and contains Windows installer, Linux installer, and updater manifest.

**Canonical queue status: Slice 5.4 = VERIFIED.**

Do not repeat Slice 5.4 merely because implementation/planning text remains elsewhere. Phase 6 / Slice 6.1 may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.

---

### Alpha.48 real one-click result: PASSED — Slice 6.1 VERIFIED

Real live report:

- release: `v0.1.0-alpha.48`
- release target / tested implementation main: `f3f8ca882d70aa47f3a59b24abe67e48e84c2b66`
- client: `0.1.0-alpha.48` / Windows
- platform: `win32`
- test ID: `live61-7f653b0b-fc41-4da7-845b-e57600a7d178`
- outcome: `passed`
- test window: `2026-10-03T21:02:09.425Z → 2026-10-03T21:02:09.579Z`
- Character connection: not required; remained disconnected
- diagnostic export: 20 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 6.1 map/geometry validation:

- live game-data version `17397` was manually refreshed during the test;
- `54` maps were normalized;
- `49` geometry maps were present;
- all `54` modeled maps had usable finite bounds;
- total normalized collision geometry contained `13342` lines;
- representative map `main` contained `760` x-lines and `763` y-lines;
- `98` door/transition records were normalized;
- raw invalid transition count was `2`;
- blocking invalid transition count was `0`;
- both invalid references belonged only to ignored prototype map data and were retained as non-blocking diagnostic evidence;
- representative `main:door:0` resolved successfully to map `woffice`, spawn `0`, coordinates `-24,83`, direction `3`;
- the representative transition was valid with no problems;
- no Character was required;
- Character status remained `disconnected → disconnected`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- `pathfinding:false`.

Historical alpha.47 result remains append-only evidence:

- alpha.47 was blocked at preflight by an unnecessary Character requirement;
- it also surfaced the two ignored prototype-map dangling door references;
- PR #94 corrected both issues;
- alpha.48 proves the corrected semantics against fresh live data.

Repository/release evidence:

- implementation PR #93 merged at `75e99f0f35e271e747de8efab3afd826aae38421`;
- exact post-implementation-main CI `37152440103` completed with all four required jobs successful;
- corrective PR #94 merged at exact main `f3f8ca882d70aa47f3a59b24abe67e48e84c2b66`;
- exact post-hotfix-main CI `37153288628` completed with all four required jobs successful;
- release publish run `37153415634` completed successfully;
- `v0.1.0-alpha.48` targets the tested commit and contains Windows installer, Linux installer, and updater manifest.

**Canonical queue status: Slice 6.1 = VERIFIED.**

Do not repeat Slice 6.1 merely because the historical alpha.47 blocked result or original planning text remains elsewhere. Slice 6.2 – einfacher Path Planner may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.

---

### Alpha.49 real one-click result: PASSED — Slice 6.2 VERIFIED

Real live report:

- release: `v0.1.0-alpha.49`
- release target / tested implementation main: `c99b4e9f05431813b9fbc7d6d37a2ff1b99dc402`
- client: `0.1.0-alpha.49` / Windows
- platform: `win32`
- test ID: `live62-2a6c8bd1-3f5b-40e6-ab71-c1fe207ea77d`
- outcome: `passed`
- test window: `2026-10-03T21:28:21.705Z → 2026-10-03T21:28:22.060Z`
- Character connection: not required; remained disconnected
- diagnostic export: 25 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 6.2 path-planner validation:

- fresh live Adventure Land game data version `17397` was reloaded during the test;
- the planner consumed the verified navigation model with `54` maps, `98` transitions, and `13342` collision lines;
- blocking invalid transition count was `0`;
- several real candidate routes were correctly rejected as `PATH_NO_ROUTE` before one reachable route was accepted;
- selected transition: `main:door:7`;
- source spawn: `main` index `11` at `1937,-12`;
- door waypoint: `main:door:7` at `1936,-23`;
- arrival: `level1` spawn `1` at `0,9`;
- route status: `reachable`;
- ordered waypoint count: `3`;
- route leg count: `2`;
- independently validated walk legs: `1`;
- independently validated transition legs: `1`;
- walk distance: `11.045361017187261`;
- transition metadata was empty, so the selected transition was unconditional;
- planner diagnostics: `226` candidate nodes, `68` directed walk edges, `82` transition edges, `1145` direct collision checks, `4` expanded nodes, `1` map hop;
- total route cost: `59.04536101718726`;
- skipped ignored maps: `5`;
- skipped invalid transitions: `0`;
- skipped conditional transitions: `9`;
- visited maps: `main → level1`;
- Character stayed `disconnected → disconnected`;
- `movementExecution:false`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`.

Repository/release evidence:

- implementation PR #96 merged at exact main `c99b4e9f05431813b9fbc7d6d37a2ff1b99dc402`;
- PR CI run `37154637884` completed with all four required jobs successful;
- exact post-implementation-main CI `37154817728` completed with all four required jobs successful;
- release publish run `37154978975` completed successfully;
- `v0.1.0-alpha.49` targets exact commit `c99b4e9f05431813b9fbc7d6d37a2ff1b99dc402`;
- release branch, release tag, and implementation `main` were verified commit-identical;
- published Windows installer, Linux installer, and updater manifest were present.

**Canonical queue status: Slice 6.2 = VERIFIED.**

Do not repeat Slice 6.2 merely because earlier planning text or rejected probe candidates remain in logs. Slice 6.3 – Smart-Move-Kompatibilität may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.

---

### Alpha.50 real one-click result: PASSED — Slice 6.3 VERIFIED

Real live report:

- release: `v0.1.0-alpha.50`
- release target / tested implementation main: `14b80c34b3803b46fd2ff4bce70026b2eef68aac`
- client: `0.1.0-alpha.50` / Windows
- platform: `win32`
- test ID: `live63-ba01676e-106d-4eb1-8b01-96663b19c3bf`
- outcome: `passed`
- test window: `2026-10-03T22:06:35.139Z → 2026-10-03T22:06:35.388Z`
- live Character: `My_Merchant` on `EU II`, map `main`, position `-25,-478`
- diagnostic export: 32 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 6.3 smart-move compatibility validation:

- the isolated worker exposed `smart_move()`;
- an Adventure Land-style coordinate destination at the current Character position returned `already_there`;
- the resulting planner route was `reachable` with zero legs, zero map hops, and zero walk distance;
- request counters changed by exactly `2`, with exactly `1` successful completion;
- an intentionally unsupported string selector returned stable explicit error code `SMART_MOVE_TARGET_UNSUPPORTED`;
- the final SmartMove diagnostic state retained that exact error code;
- Character remained connected at exactly `main -25,-478`;
- `movementExecution:false`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- action-gateway records during the passive probe: `0`;
- script runtime finished `stopped` with zero active timers and zero active event listeners;
- live navigation model remained `ready` on game-data version `17397`, with `54` maps, `98` transitions, `13342` collision lines, and `0` blocking invalid transitions.

Repository/release evidence:

- implementation PR #98 merged at exact main `14b80c34b3803b46fd2ff4bce70026b2eef68aac`;
- final PR CI run `37156623042` completed with all four required jobs successful;
- exact post-implementation-main CI `37156789360` completed with all four required jobs successful;
- release publish run `37156936073` completed successfully;
- `v0.1.0-alpha.50` targets exact commit `14b80c34b3803b46fd2ff4bce70026b2eef68aac`;
- release branch, release tag, and implementation `main` were verified commit-identical;
- published Windows installer, Linux installer, and updater manifest were present with recorded SHA-256 digests.

**Canonical queue status: Slice 6.3 = VERIFIED.**

Do not repeat Slice 6.3 merely because implementation planning text remains elsewhere. Slice 6.4 – Movement Trail und geplante Route im Dashboard may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.



---

### Alpha.52 real one-click result: PASSED — Slice 6.4 VERIFIED

Real live report:

- release: `v0.1.0-alpha.52`
- release target / tested fix main: `00269af70beab88e09213ff1800ffdeb6f645cfc`
- client: `0.1.0-alpha.52` / Windows
- platform: `win32`
- test ID: `live64-8811129f-260e-4b20-a51d-e770b029380a`
- character: `My_Ranger2`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T22:57:24.310Z → 2026-10-03T22:57:26.158Z`
- diagnostic export: 76 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 6.4 movement-debug validation:

- preflight selected a collision-safe bounded 32-unit round trip on `main` from `-1163.5698084909386,-87.06988736141028`;
- the existing planner produced one `reachable` same-map walk leg with `mapHops:0` and `totalWalkDistance:32`;
- movement-debug telemetry retained that exact planned route and advanced `plannedRouteCount 0 → 1`;
- outbound Action Gateway request `act-eadf552b-29f4-474d-ab0a-34ab30ff530e` completed with dashboard origin and server-confirmed target `-1131.5698084909386,-87.06988736141028`;
- return Action Gateway request `act-25adac2d-4056-4e93-abb1-c201c5981f05` completed with dashboard origin and server-confirmed original position `-1163.5698084909386,-87.06988736141028`;
- movement count changed by exactly `2`;
- trail point count changed `0 → 3`, retaining the start plus both confirmed movement observations;
- final Character position exactly matched the original position;
- user Script runtime remained `unloaded → unloaded`;
- `userScriptInterrupted:false`;
- `actionGatewayRequired:true`;
- `gameplayMutation:true` only for the intended bounded round trip;
- `rawSocketAccess:false`.

Historical alpha.51 failure remains valid append-only evidence:

- alpha.51 real test `live64-c0c65f09-452f-45de-b787-83103488b4fa` failed with `MOVE_TARGET_INVALID` after the outbound move was considered confirmed at an intermediate position;
- corrective PR #101 changed central movement confirmation to require server-observed arrival at the requested target;
- alpha.52 proves the corrected semantics on the real Windows client.

Repository/release evidence:

- implementation PR #100 merged at exact main `0a380d6e2170365971a58490a571f79804061989`;
- final implementation PR CI `37158757766` and exact post-implementation-main CI `37158929260` completed successfully;
- alpha.51 publish run `37159067914` completed successfully;
- corrective PR #101 merged at exact main `00269af70beab88e09213ff1800ffdeb6f645cfc`;
- corrective PR CI `37159608659` and exact post-fix-main CI `37159753137` completed with all four required jobs successful;
- alpha.52 publish run `37159899297` completed successfully;
- `v0.1.0-alpha.52`, its release branch, tag, and tested main were verified commit-identical;
- published Windows installer SHA-256: `6f587129575aa43033227136f7b8cf1b8fbcbd5d2647d4c05d3ece14e4e8e68a`;
- published Linux installer SHA-256: `0ca0ac37e52addb1b5a19bc7d98fddbe3e9159c07f9080a1d16554366e7925e0`;
- published updater manifest SHA-256: `24f1f37231718876fe51e0719d6bf660f9ed0d1cca010ca6c6b2e4f95d268fd0`.

**Canonical queue status: Slice 6.4 = VERIFIED.**

Do not repeat Slice 6.4 merely because the historical alpha.51 failed report remains as evidence. Phase 7 / Slice 7.1 – Multi-Character Session Manager may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.


---

### Alpha.53 real one-click result: PASSED — Slice 7.1 VERIFIED

Real live report:

- release: `v0.1.0-alpha.53`
- release target / tested implementation main: `25d13a769501c502e6d2ad65456c0bdf02a3b634`
- client: `0.1.0-alpha.53` / Windows
- platform: `win32`
- test ID: `live71-ad99db70-9c18-405e-b7d2-40ba7bb5b070`
- primary Character: `My_Merchant`
- managed test Character: `My_Ranger1`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T23:27:11.423Z → 2026-10-03T23:27:11.635Z`
- diagnostic export: 56 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 7.1 multi-character session validation:

- preflight began with exactly one active primary session, three available slots, loaded shared game-data version `17397`, and an unloaded user Script runtime;
- the manager connected `My_Ranger1` as one additional isolated managed session on the same EU II server;
- live concurrent state reached exactly `2` active sessions: one primary plus one managed;
- both sessions reported `connected`;
- the managed session reported the same shared process-level game-data version `17397`;
- a duplicate start for the already-managed Character was rejected locally with stable error `SESSION_CHARACTER_ALREADY_ACTIVE`;
- the duplicate guard left both existing sessions healthy and unchanged;
- session limit remained `4` throughout the probe;
- cleanup stopped only the managed test session with controlled reason `slice71_live_test`;
- final state returned to exactly one active primary session and zero managed sessions;
- the primary Character remained connected;
- user Script runtime stayed `unloaded → unloaded` and was not interrupted;
- shared game-data version stayed `17397 → 17397`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`.

Diagnostic evidence additionally confirms the managed-session lifecycle in order:

1. managed session start requested for `My_Ranger1`;
2. second headless Character connection started;
3. `My_Ranger1` connected headlessly;
4. manager reported `activeSessionCount:2`, `sessionLimit:4`, and `sharedStaticData:true`;
5. the managed Character disconnected under controlled reason `slice71_live_test`;
6. manager recorded the managed session stopped;
7. the Slice 7.1 live test recorded its final PASS.

Repository/release evidence:

- implementation PR #103 used exact feature head `b1442654481786131d1bce45a5a698687608f76a`;
- PR CI run `37161318643` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #103 merged with method `merge` into exact implementation main `25d13a769501c502e6d2ad65456c0bdf02a3b634`;
- exact post-implementation-main CI run `37161460939` completed with all four required jobs successful;
- release publish run `37161609474` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.53`, tag `v0.1.0-alpha.53`, GitHub release target, and tested implementation `main` were verified commit-identical at `25d13a769501c502e6d2ad65456c0bdf02a3b634`;
- published assets:
  - Windows x64 installer SHA-256 `b3db93e374273c0eeeff90db7d162b2185e9a0aa74073d1b44bbde282ac40d12`
  - Linux x64 installer SHA-256 `871577f951569461287782e7989bf857532dffbc8cbba4b4a734e43c33ae3a8e`
  - updater manifest SHA-256 `7843f593d72efbe0190c36844705fb1e5a9c03632e865ed826eb5f1bf9549fbe`.

**Canonical queue status: Slice 7.1 = VERIFIED.**

Do not repeat Slice 7.1 merely because implementation planning text remains elsewhere. Slice 7.2 – Local Character Messaging may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.


---

### Alpha.54 real one-click result: PASSED — Slice 7.2 VERIFIED

Real live report:

- release: `v0.1.0-alpha.54`
- release target / tested implementation main: `6c8fc1d548341413695ff5facd597c588c863afd`
- client: `0.1.0-alpha.54` / Windows
- platform: `win32`
- test ID: `live72-992e8382-2e17-4987-885b-b9ea8cb7f77a`
- primary Character: `My_Merchant`
- managed test Character: `My_Ranger1`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T00:00:33.309Z → 2026-10-04T00:00:33.696Z`
- diagnostic export: 61 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 7.2 local Character messaging validation:

- preflight began with exactly one active primary Character session, three available session slots, an unloaded user Script runtime, `localOnly:true`, and `rawSocketAccess:false`;
- the manager connected `My_Ranger1` as one temporary managed Character on EU II, producing exactly two active local Character sessions;
- an isolated probe worker on primary `My_Merchant` called Adventure Land-compatible `send_cm()` with the active local target plus one intentionally missing target;
- the first local message was delivered `My_Merchant → My_Ranger1` with sequence `1`;
- the compatible result reported `receivers:["My_Ranger1"]` and `locals:["My_Ranger1"]`;
- the intentionally missing local recipient was omitted from `receivers` / `locals`, and telemetry recorded exactly one unavailable recipient;
- the managed Character then sent the local reply `My_Ranger1 → My_Merchant` with sequence `2`;
- the reply reached the primary isolated worker as an Adventure Land-compatible `character.on("cm")` event;
- the worker diagnostic explicitly recorded event name `cm` and the probe logged the matching receive marker;
- global/server CM routing was not used;
- final messaging deltas were exactly `2` requests, `2` local deliveries, and `1` unavailable recipient;
- cleanup stopped the isolated probe worker and only the managed test session;
- final session state returned to exactly one active primary Character and zero managed Characters;
- primary `My_Merchant` remained connected;
- user Script runtime stayed `unloaded → unloaded`;
- `userScriptInterrupted:false`;
- `localOnly:true`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- `serverRoutingUsed:false`.

Diagnostic evidence confirms the critical ordering:

1. Slice 7.2 live test started with local-only safety flags;
2. managed session start requested and `My_Ranger1` connected;
3. isolated `slice72-local-cm-probe` worker loaded and started;
4. primary-to-managed local message sequence `1` delivered;
5. `send_cm()` completed locally with one requested target omitted as unavailable;
6. managed-to-primary local reply sequence `2` delivered;
7. runtime dispatched Adventure Land game event `cm`;
8. probe recorded the matching `character.on("cm")` receive marker;
9. probe worker stopped;
10. managed Character disconnected under controlled reason `slice72_live_test`;
11. managed session stopped;
12. final Slice 7.2 PASS recorded with exact request/delivery deltas and all safety flags.

Repository/release evidence:

- implementation PR #105 final feature head: `64605f34d3ddddf1c4a915534c3f387d638bc910`;
- final PR CI run `37162978790` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #105 merged with method `merge` into exact implementation main `6c8fc1d548341413695ff5facd597c588c863afd`;
- exact post-implementation-main CI run `37163145066` completed with all four required jobs successful;
- release publish run `37163273306` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.54`, tag `v0.1.0-alpha.54`, GitHub release target, and tested implementation `main` were verified commit-identical at `6c8fc1d548341413695ff5facd597c588c863afd`;
- published assets:
  - Windows x64 installer SHA-256 `b820dee62c979a6db12aaaf0bdda447c5ae87b263f138e25fc8bb96a84a03c97`
  - Linux x64 installer SHA-256 `d089027ff36818198332c4db45a350c78560fbbc2e3ab91b1298e560492e31cd`
  - updater manifest SHA-256 `30966331837085610a6c304138886b673bc343db3461559b36457d5098189761`.

**Canonical queue status: Slice 7.2 = VERIFIED.**

Do not repeat Slice 7.2 merely because implementation planning text or historical failed CI attempts remain elsewhere. Slice 7.3 – Party Coordinator may start only after this verification documentation is merged and the exact post-merge `main` CI is fully green.



---

### Alpha.55 real one-click result: PASSED — Slice 7.3 VERIFIED

Real live report:

- release: `v0.1.0-alpha.55`
- release target / tested implementation main: `eca584e5af4d5bd7d79c26f0cc62bbcea610af63`
- client: `0.1.0-alpha.55` / Windows
- platform: `win32`
- test ID: `live73-a3aecc82-6240-4958-93b2-881d0b074c6f`
- primary Character: `My_Merchant`
- managed test Character: `My_Ranger1`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T00:39:54.747Z → 2026-10-04T00:39:54.982Z`
- diagnostic export: 54 log lines, `Secrets sanitized: yes`

The one-click harness completed the full Slice 7.3 Party Coordinator validation:

- preflight began with exactly one active primary Character session, one offline secondary Character, three free managed-session slots, an unloaded user Script runtime, and safe local coordination infrastructure;
- `My_Merchant` and temporary managed `My_Ranger1` were coordinated around one shared logical target;
- initial role assignment was Tank for `My_Merchant` and Healer for `My_Ranger1`, both reporting `ready`;
- the Coordinator transport was `shared-process-state`, with `localMessagingRequired:false`;
- no gameplay automation was invoked: `gameplayMutation:false`;
- no raw socket path was used: `rawSocketAccess:false`;
- Slice 7.4 Party Templates remained inactive: `partyTemplatesActive:false`;
- the managed Character changed from Healer to DPS and the Healer aggregate returned to `unassigned`, proving no stale cross-role state leaked;
- clearing the shared target produced explicit `no-target` status for both active members;
- restoring the target returned coordinated state before cleanup;
- removing only the temporary managed session pruned its Coordinator member and DPS assignment while the primary remained present;
- after removal the Coordinator contained exactly one member, the primary Character, and DPS assigned count returned to zero;
- the pre-test Coordinator configuration was restored;
- final active session state returned to one primary Character and zero managed Characters;
- primary `My_Merchant` remained connected;
- the user Script runtime was not replaced or interrupted: `userScriptInterrupted:false`;
- local Character messaging was untouched: request delta `0`, delivery delta `0`;
- messaging remained `localOnly:true`;
- final safety flags remained `gameplayMutation:false`, `rawSocketAccess:false`, and `partyTemplatesActive:false`.

Diagnostic/runtime evidence:

1. installed client started as `ALRemastered 0.1.0-alpha.55` on `win32`;
2. the application reported an automatic restart after update;
3. primary `My_Merchant` connected headlessly on EU II with automation disabled;
4. Slice 7.3 preflight observed one active primary session and an unloaded user Script runtime;
5. the temporary `My_Ranger1` managed session was used only for local coordinator validation;
6. Tank/Healer role assignment and one shared logical target reached ready state;
7. managed role changed Healer → DPS without stale Healer membership;
8. shared target clearing exposed `no-target` for both active members;
9. managed-session removal pruned only the managed member and its DPS assignment;
10. final state restored the pre-test Coordinator configuration and left only the primary session connected.

Repository/release evidence:

- implementation PR #107 final feature head: `469b0213f168068f7854e0ea265e6b1721bd3ba4`;
- final implementation PR CI run `37164949495` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #107 merged with method `merge` into exact implementation main `eca584e5af4d5bd7d79c26f0cc62bbcea610af63`;
- exact post-implementation-main CI run `37165070088` completed successfully;
- release publish run `37165210493` completed successfully;
- release branch `release/v0.1.0-alpha.55`, tag `v0.1.0-alpha.55`, GitHub release target, and tested implementation `main` were verified commit-identical at `eca584e5af4d5bd7d79c26f0cc62bbcea610af63`;
- published assets:
  - Windows x64 installer SHA-256 `0f85d4bee480a36663fdc15e08d56cdead687fbddb0b4087c9e1b23341f94c9a`
  - Linux x64 installer SHA-256 `ed0a38c728fca7d62185755356204e3b8e4baf70f5c16b89f965dc1b85d34c2d`
  - updater manifest SHA-256 `8199b54449fe643579a04d25db6546fd73971c6c1a70cad4eac08b138d53f841`.

**Canonical queue status: Slice 7.3 = VERIFIED.**

Do not repeat Slice 7.3 merely because implementation planning text remains elsewhere. Slice 7.4 – Party Templates may begin only after this verification documentation is merged and the exact post-merge `main` CI is fully green.


---

### Alpha.56 real one-click result: PASSED — Slice 7.4 VERIFIED

Real live report:

- release: `v0.1.0-alpha.56`
- release target / tested implementation main: `95cdc12d7948322585dd71c2e14d32329278016b`
- client: `0.1.0-alpha.56` / Windows
- platform: `win32`
- test ID: `live74-7c8190e0-ca2c-4d1a-bb29-302f478ad7a4`
- primary Character: `My_Merchant`
- temporary managed template Characters: `My_Warrior` and `My_Priest`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T07:21:15.300Z → 2026-10-04T07:21:15.726Z`
- diagnostic export: 68 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 7.4 Party Templates validation:

- preflight began with exactly one active primary Character session, three free managed-session slots, an unloaded user Script runtime, and zero local messaging requests/deliveries;
- primary `My_Merchant` was a Merchant and correctly received the DPS recommendation;
- temporary `My_Warrior` was selected for Warrior Tank and expected role `tank`;
- temporary `My_Priest` was selected for Priest Healer and expected role `healer`;
- applying recommended roles produced three matched assignments:
  - `My_Merchant → dps`
  - `My_Priest → healer`
  - `My_Warrior → tank`;
- Coordinator role aggregates for Tank, Healer, and DPS all reached `ready` with exactly one assigned/ready member each;
- Party Template state reported `templateLayerActive:true`;
- the template layer reused `coordinationTransport:"party-coordinator"`;
- `localMessagingRequired:false`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- simple manual assignment was validated by overriding the DPS member to Healer, observing `override`, clearing the role to `needs-assignment`, and restoring the recommended DPS role to `matched`;
- removing the two temporary managed sessions pruned their template assignments with no stale managed-member state;
- after managed-member removal, exactly one local member remained;
- final active session state returned to `activeSessionCount:1`, `managedSessionCount:0`;
- primary `My_Merchant` remained connected;
- the user Script runtime was not interrupted: `userScriptInterrupted:false`;
- local Character messaging remained untouched: request delta `0`, delivery delta `0`;
- messaging remained `localOnly:true`;
- final safety flags remained `gameplayMutation:false`, `rawSocketAccess:false`, and `localMessagingRequired:false`;
- `coordinatorConfigurationRestored:true`;
- post-test Coordinator state returned to its pre-test no-role/no-target configuration rather than retaining temporary template assignments.

Repository/release evidence:

- implementation PR #109 final feature head: `12ac5449f52455c2eb3aed211fe5fe3c4488a0d8`;
- final implementation PR CI run `37185032816` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #109 merged with method `merge` into exact implementation main `95cdc12d7948322585dd71c2e14d32329278016b`;
- exact post-implementation-main CI run `37185171997` completed with all four required jobs successful;
- release publish run `37185333404` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.56`, tag `v0.1.0-alpha.56`, GitHub release target, and tested implementation `main` were verified commit-identical at `95cdc12d7948322585dd71c2e14d32329278016b`;
- published assets:
  - Windows x64 installer SHA-256 `b0ef6102db5a7b7919f5cfaf8d972f91587119a7741951fe8767d6aa63121c79`
  - Linux x64 installer SHA-256 `3dc247e5f8c31c8a41fc860f4a861fdce75c92a5d4729f354807fbfdb6dae038`
  - updater manifest SHA-256 `0499650cfc42da2a75089686c6563944b0be8a5257f4963c88a084d408ea18f4`.

**Canonical queue status: Slice 7.4 = VERIFIED.**

Do not repeat Slice 7.4 merely because implementation planning text remains elsewhere. The next roadmap slice may begin only after this verification documentation is merged and the exact post-merge `main` CI is fully green.


---

### Alpha.57 real one-click result: PASSED — Slice 8.1 VERIFIED

Real live report:

- release: `v0.1.0-alpha.57`
- release target / tested implementation main: `620763ca56978a883b0973db5c4126137091ae06`
- client: `0.1.0-alpha.57` / Windows
- platform: `win32`
- test ID: `live81-7b50f7cd-fe27-4fc5-9578-3e8bbabde016`
- primary Character: `My_Merchant`
- temporary managed Character: `My_Ranger1`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T07:52:06.842Z → 2026-10-04T07:52:07.219Z`
- diagnostic export: 148 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 8.1 Character Cards validation:

- preflight exposed live primary Card telemetry with HP `3035/3079`, MP `1838/1915`, map `main`, target `None`, Script status `unloaded`, and Health `healthy`;
- preflight began with exactly one active primary Character session, zero managed sessions, and the user Script runtime unloaded;
- managed Start created one temporary `My_Ranger1` session through the existing multi-character session manager;
- the managed Card immediately reported `sessionRole:"managed"`, `connectionStatus:"connected"`, and Health `healthy`;
- managed per-Character Script state correctly remained explicitly `not-available` rather than introducing a second Script runtime model;
- primary Pause was exercised with the isolated `slice81-pause-probe` Script runtime;
- the probe reached `scriptStatus:"paused"` and the Pause control disabled after the transition;
- the actual user Script runtime was not touched: `userScriptInterrupted:false`;
- managed Stop removed only the temporary `My_Ranger1` session;
- after Stop, the managed Card returned to `connectionStatus:"offline"`, Health `offline`, and Start-ready state;
- final managed-session count returned to `0`;
- primary `My_Merchant` remained connected;
- final user Script status remained `unloaded`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- final Character Cards state contained one active local session out of the four-session limit.

Repository/release evidence:

- implementation PR #111 final feature head: `12767199ae6d916f4e2f724d046f16b983ad33c3`;
- final implementation PR CI run `37186531446` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #111 merged with method `merge` into exact implementation main `620763ca56978a883b0973db5c4126137091ae06`;
- exact post-implementation-main CI run `37186688516` completed with all four required jobs successful;
- release publish run `37186845177` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.57`, tag `v0.1.0-alpha.57`, GitHub release target, and tested implementation `main` were verified commit-identical at `620763ca56978a883b0973db5c4126137091ae06`;
- published assets:
  - Windows x64 installer SHA-256 `714eaf46ba9c4d4586a240f916ea3c6fe66407e1e2e06429a692dea06a2787db`
  - Linux x64 installer SHA-256 `e73d7d991dee142f3418e11b47052c35f75d7bfc13a3fcd2cef5c9276569db38`
  - updater manifest SHA-256 `55431886b8aa1095014bd62fe83c200e47d84440374fd31d82e94118cd570b9a`.

**Canonical queue status: Slice 8.1 = VERIFIED.**

Do not repeat Slice 8.1 merely because implementation planning text remains elsewhere. Slice 8.2 – Setup Wizard may begin only after this verification documentation is merged and the exact post-merge `main` CI is fully green.


---

### Alpha.58 real one-click result: PASSED — Slice 8.2 VERIFIED

Real live report:

- release: `v0.1.0-alpha.58`
- release target / tested implementation main: `b14379f607029de039075d8f596d08633b003693`
- client: `0.1.0-alpha.58` / Windows
- platform: `win32`
- test ID: `live82-1da77edd-3ef4-426d-8b60-af9605fb24de`
- primary Character: `My_Merchant`
- temporary managed Character: `My_Ranger1`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T08:21:39.932Z → 2026-10-04T08:21:40.145Z`
- diagnostic export: 33 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 8.2 Setup Wizard validation:

- Account stage recognized the already connected Adventure Land account without reconnecting or storing credentials;
- Character stage selected offline `My_Ranger1` as the bounded probe Character;
- Server stage reused EU II / `SR_EUII`;
- Task / Template stage selected `connect-only`, explicitly avoiding task automation and Script runtime startup;
- Configuration correctly required no additional settings for Connect only;
- Start created exactly one managed Character session through the existing Character Cards path;
- the temporary managed Character reached `sessionRole:"managed"` and `connectionStatus:"connected"`;
- `taskStarted:false`;
- active local sessions temporarily reached `2` with exactly `1` managed session;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- cleanup removed only the temporary managed Character;
- final `managedSessionCountAfter:0`;
- primary `My_Merchant` remained `connected`;
- final user Script state remained `unloaded`;
- `userScriptInterrupted:false`;
- all six required visible Wizard stages were present in English:
  - Account
  - Character
  - Server
  - Task / Template
  - Configuration
  - Start.

Repository/release evidence:

- implementation PR #113 final feature head: `511d5741e00537231a8ef6bf22a7f134bb599c78`;
- final implementation PR CI run `37188104304` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #113 merged with method `merge` into exact implementation main `b14379f607029de039075d8f596d08633b003693`;
- exact post-implementation-main CI run `37188248936` completed with all four required jobs successful;
- release publish run `37188397711` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.58`, tag `v0.1.0-alpha.58`, GitHub release target, and tested implementation `main` were verified commit-identical at `b14379f607029de039075d8f596d08633b003693`;
- published assets:
  - Windows x64 installer SHA-256 `00377cd384f17265478086f22508c0b2d440014ceb5e2f28596f3765140624fe`
  - Linux x64 installer SHA-256 `5f14c03eece98031b49e3f649e362e9371cfc411304e5d2bf810ff816e33eb5a`
  - updater manifest SHA-256 `e217fd029449d43e971bc52bb1b8a3e5faf2cd6280faa56808a2b306ea24f372`.

**Canonical queue status: Slice 8.2 = VERIFIED.**

The earlier BLOCKED precondition attempts remain valid diagnostics and are not treated as failures; the successful real installed Windows run above is the canonical verification result.

Do not repeat Slice 8.2 merely because implementation planning text remains elsewhere. Slice 8.3 – Config UI für Templates may begin only after this verification documentation is merged and the exact post-merge `main` CI is fully green.


---

### Alpha.59 real one-click result: PASSED — Slice 8.3 VERIFIED

Real live report:

- release: `v0.1.0-alpha.59`
- release target / tested implementation main: `1195c22956f9b29e02fbe4675d890913098fa86b`
- client: `0.1.0-alpha.59` / Windows
- platform: `win32`
- test ID: `live83-be56e02c-d4c7-40b7-8dfa-52dc6ab30a5f`
- primary Character: `My_Merchant`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T08:49:43.893Z → 2026-10-04T08:49:43.895Z`
- diagnostic export: 215 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 8.3 Template Configuration validation:

- schema step exposed the five normal Simple Farmer settings:
  - `monster`
  - `hpThresholdPercent`
  - `mpThresholdPercent`
  - `loot`
  - `respawn`;
- no JavaScript/source field was exposed for normal settings;
- `normalSettingsRequireCodeChanges:false`;
- the save step changed the normal configuration through the schema-driven configuration service:
  - monster remained `bee`
  - HP threshold `50 → 49`
  - MP threshold `30 → 29`
  - Loot `true → false`
  - Respawn remained `true`;
- saving settings did not edit or start Script code;
- `userScriptInterrupted:false`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- the restore step returned the exact pre-test draft state, with `hadSavedDraftBefore:false` and `configuredAfterRestore:false`;
- final primary `My_Merchant` remained `connected`;
- final user Script status remained `unloaded`;
- no gameplay action was started.

Repository/release evidence:

- implementation PR #115 final feature head: `6aee3f376774f6d8ffc5d353a9d97c5c4e8ffe03`;
- final implementation PR CI run `37189640249` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #115 merged with method `merge` into exact implementation main `1195c22956f9b29e02fbe4675d890913098fa86b`;
- exact post-implementation-main CI run `37189763784` completed with all four required jobs successful;
- release publish run `37189914134` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.59`, tag `v0.1.0-alpha.59`, GitHub release target, and tested implementation `main` were verified commit-identical at `1195c22956f9b29e02fbe4675d890913098fa86b`;
- published assets:
  - Windows x64 installer SHA-256 `e514bc820ca55b09373e41e41cedfca7a40917e5fa2c7e3d8f554d58023ef405`
  - Linux x64 installer SHA-256 `8c3bbf1065f750302af11fa0d2aaeaa2471b6f16382310181ce2b9b619081d15`
  - updater manifest SHA-256 `4637c5eec7e53b94712c45375a3dae93cfb0cf3c22a1d0510763ab615d9f952a`.

**Canonical queue status: Slice 8.3 = VERIFIED.**

Do not repeat Slice 8.3 merely because implementation planning text remains elsewhere. The dashboard-maintenance cleanup that hides historical one-click verification controls from the normal UI may begin only after this verification documentation is merged and the exact post-merge `main` CI is fully green. Historical live-test services, APIs, CI suites, and evidence remain retained.


---

### Alpha.60 real one-click result: PASSED — Slice 8.4 VERIFIED

Real live report:

- release: `v0.1.0-alpha.60`
- release target / tested implementation main: `cfb203e199f5f89733d8174e213e3d39ffdfb445`
- client: `0.1.0-alpha.60` / Windows
- platform: `win32`
- test ID: `live84-186baff7-0dec-49a2-98ea-f4af7236bc09`
- primary Character: `My_Merchant`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T09:38:12.483Z → 2026-10-04T09:38:12.485Z`
- diagnostic export: 35 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 8.4 explainability validation:

- Strategy: `Simple Farmer`, currently inactive / runtime status `idle`, configured monster `bee`;
- current target preview selected the nearest eligible visible `bee`:
  - target ID `5757471`
  - distance `375.3`
  - attack range `70`
  - `inRange:false`;
- selection reason was exposed explicitly as a read-only preview because the template was not running;
- rejected-target telemetry was populated with 12 rejected candidates and per-target reasons;
- range explanation explicitly reported `Target is out of range (375.3 > 70).`;
- cooldowns were exposed as Attack `0 ms`, HP `0 ms`, MP `0 ms`;
- movement target correctly reported none, with the explanation that Simple Farmer itself does not navigate;
- next action was `Start template`, because Simple Farmer was configured/readable but not running;
- two blockers were exposed:
  - Simple Farmer Template is not running;
  - selected target is outside attack range and Simple Farmer does not navigate.

Isolation and safety evidence:

- the `explainability` step passed;
- the `isolation` step passed;
- primary Character remained `connected`;
- user Script status remained `unloaded`;
- Action Gateway request count remained exactly `0 → 0`;
- `readOnly:true`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- no gameplay action was dispatched by the explainability read path.

Repository/release evidence:

- implementation PR #118 final feature head: `25c144b4ec134c1c05ece7d02c6507eccc343848`;
- final implementation PR CI run `37191850363` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #118 merged with method `merge` into exact implementation main `cfb203e199f5f89733d8174e213e3d39ffdfb445`;
- exact post-implementation-main CI run `37191997325` completed with all four required jobs successful;
- release publish run `37192184994` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.60`, tag `v0.1.0-alpha.60`, GitHub release target, and tested implementation `main` were verified commit-identical at `cfb203e199f5f89733d8174e213e3d39ffdfb445`;
- published assets:
  - Windows x64 installer SHA-256 `bf0d147424d9881656c21d0cb5ebdba3132fd6fcf7733d1ee5b5d1535ccbcaaa`
  - Linux x64 installer SHA-256 `dddd576cd25ff0968a992a4aa2e087ec4cff899075087bbe75c0357e694a4f74`
  - updater manifest SHA-256 `1af34f4310df1f07ef01b7c8c45967ce98c42cff980cc2d2c5a35257f11c774b`.

Dashboard verification workflow:

- `Current verification` exposed Slice 8.4 as the single active manual verification harness;
- historical one-click harnesses remain retained through their services, APIs, automated suites, and historical evidence while hidden from the normal workflow.

**Canonical queue status: Slice 8.4 = VERIFIED.**

The out-of-range target and inactive template are expected live-state observations, not failures: the purpose of Slice 8.4 is to explain the existing decision state without changing it.

Phase 8 is functionally complete. Phase 9 / Slice 9.1 – Dashboard Edit Mode may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.

---

### Alpha.61 real one-click result: PASSED — Slice 9.1 VERIFIED

Real live report:

- release: `v0.1.0-alpha.61`
- release target / tested implementation main: `9345ddbd9be81a17e993b766de2b0819cf6c0804`
- client: `0.1.0-alpha.61` / Windows
- platform: `win32`
- test ID: `live91-8e196f02-0e2e-4d61-bfdd-e725d8eaf058`
- outcome: `passed`
- test window: `2026-10-04T10:09:33.476Z → 2026-10-04T10:09:33.486Z`
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 9.1 Dashboard Edit Mode validation:

- `edit-mode-toggle: PASSED`;
- `drag-and-drop: PASSED`;
- `resize: PASSED`;
- `grid-snapping: PASSED`;
- `add-remove-widgets: PASSED`;
- `normal-mode: PASSED`;
- grid contract: 12 columns with 48 px row snapping;
- layout persistence remained intentionally disabled for Slice 9.1: `Persistence:false`;
- `gameplayMutation:false`;
- Action Gateway requests: `0`;
- `rawSocketAccess:false`;
- user Script runtime was not touched;
- the diagnostic export was sanitized and contained no reported secret exposure.

Repository/release evidence:

- implementation PR #120 final feature head: `ac10b06123ebceee458bfefb7ad9b413c16e01b7`;
- final implementation PR CI run `37193902258` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #120 merged with method `merge` into exact implementation main `9345ddbd9be81a17e993b766de2b0819cf6c0804`;
- exact post-implementation-main CI run `37194083144` completed with all four required jobs successful;
- release publish run `37194244198` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.61`, tag `v0.1.0-alpha.61`, GitHub release target, publish-run head, and tested implementation `main` were verified commit-identical at `9345ddbd9be81a17e993b766de2b0819cf6c0804`;
- published assets:
  - Windows x64 installer SHA-256 `512bb62f79133c34b728546731a0678c9c0b5bd6e4ebd3101f55773554f41379`
  - Linux x64 installer SHA-256 `253a69dcf0e8fb082027344fac2282cdf41dd810f16cf97332cad2b4114fbb0f`
  - updater manifest SHA-256 `e49658e6031e8d0c154b7b4b3db068f2ed03fcc73905df7f6a81e7e6de58c31b`.

**Canonical queue status: Slice 9.1 = VERIFIED.**

Slice 9.2 – Widget-Konfiguration may begin only after this verification documentation is merged and the exact post-merge `main` CI is fully green. Persistence/restart/undo-redo/profiles remain reserved for Slice 9.4 and were not part of this verification.

---

### Alpha.62 real one-click result: PASSED — Slice 9.2 VERIFIED

Real live report:

- release: `v0.1.0-alpha.62`
- release target / tested implementation main: `cf6770f10758638dcc5a6fc8f55549b4f9f7c2c8`
- client: `0.1.0-alpha.62` / Windows
- platform: `win32`
- test ID: `live92-8a073263-f52e-4ccb-afcb-f2308e63c1b3`
- outcome: `passed`
- test window: `2026-10-04T10:40:26.609Z → 2026-10-04T10:40:26.621Z`
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 9.2 Widget Configuration validation:

- `character-selection: PASSED`;
- `field-visibility: PASSED`;
- `display-options: PASSED`;
- `duplicate-widget: PASSED`;
- `independent-configuration: PASSED`;
- `normal-mode: PASSED`;
- configuration persistence remained intentionally disabled for Slice 9.2: `Configuration persistence:false`;
- `gameplayMutation:false`;
- Action Gateway requests: `0`;
- `rawSocketAccess:false`;
- user Script runtime was not touched;
- the diagnostic export was sanitized and contained no reported secret exposure.

Repository/release evidence:

- implementation PR #122 final feature head: `818d1991f35c7197395c2f160b5146cf7a69a2c8`;
- final implementation PR CI run `37195674745` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #122 merged with method `merge` into exact implementation main `cf6770f10758638dcc5a6fc8f55549b4f9f7c2c8`;
- exact post-implementation-main CI run `37195822122` completed with all four required jobs successful;
- release publish run `37195955048` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.62`, tag `v0.1.0-alpha.62`, GitHub release target, publish-run head, and tested implementation `main` were verified commit-identical at `cf6770f10758638dcc5a6fc8f55549b4f9f7c2c8`;
- published assets:
  - Windows x64 installer SHA-256 `6062c13ca9a198447792872a04e5ecf46dc45bb61a13fbf621e6597cf32c1469`
  - Linux x64 installer SHA-256 `660829fd2c014914cf5989088cacb57d349ea854406e6376d257cb74041c6fbb`
  - updater manifest SHA-256 `b241d85b38c06016bf440e3d4a949a4febac240abf6d394196a924c239d5f60c`.

**Canonical queue status: Slice 9.2 = VERIFIED.**

Slice 9.3 may begin only after this verification documentation is merged and the exact post-merge `main` CI is fully green. Persistence/restart/undo-redo/profiles remain reserved for Slice 9.4 and were not part of this verification.

---

### Alpha.63 real one-click result: PASSED — Slice 9.3 VERIFIED

Real live report:

- release: `v0.1.0-alpha.63`
- release target / tested implementation main: `8c752243892c8123df2b5a7c69e417655ba04a62`
- client: `0.1.0-alpha.63` / Windows
- platform: `win32`
- test ID: `live93-31e93fd2-d0de-44d7-bce5-eda4cc1fee4a`
- outcome: `passed`
- test window: `2026-10-04T11:02:37.769Z → 2026-10-04T11:02:37.779Z`
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 9.3 Dashboard Pages and Tabs validation:

- `page-catalog: PASSED`;
- `overview-page: PASSED`;
- `combat-page: PASSED`;
- `party-page: PASSED`;
- `merchant-page: PASSED`;
- `logs-page: PASSED`;
- `debugging-page: PASSED`;
- `return-to-overview: PASSED`;
- page catalog: Overview, Combat, Party, Merchant, Logs, Debugging;
- page selection persistence remained intentionally disabled for Slice 9.3: `Page selection persistence:false`;
- `gameplayMutation:false`;
- Action Gateway requests: `0`;
- `rawSocketAccess:false`;
- user Script runtime was not touched;
- the diagnostic export was sanitized and contained no reported secret exposure.

Repository/release evidence:

- implementation PR #124 final feature head: `6fea7902ec7076d5bb67033a610143e64f134ab0`;
- final implementation PR CI run `37196889016` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #124 merged with method `merge` into exact implementation main `8c752243892c8123df2b5a7c69e417655ba04a62`;
- exact post-implementation-main CI run `37197051999` completed with all four required jobs successful;
- release publish run `37197211506` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.63`, tag `v0.1.0-alpha.63`, GitHub release target, publish-run head, and tested implementation `main` were verified commit-identical at `8c752243892c8123df2b5a7c69e417655ba04a62`;
- published assets:
  - Windows x64 installer SHA-256 `4ccd0c505f3680656cf02f2773bfe59809ae4f7fb3f663d65e0ca7489c17a08d`
  - Linux x64 installer SHA-256 `f475fad1d1b29675a77755601ce6673b9aa697d51a506b628078890a1856974e`
  - updater manifest SHA-256 `ef123174d592b75b0d426fb7ac42255edb8d72d781e8620f7055c47477dd9388`.

**Canonical queue status: Slice 9.3 = VERIFIED.**

Slice 9.4 – Layout Persistence and Profiles may begin only after this verification documentation is merged and the exact post-merge `main` CI is fully green.



---

### Alpha.64 real one-click result: PASSED — Slice 9.4 VERIFIED

Real live report:

- release: `v0.1.0-alpha.64`
- release target / tested implementation main: `b466c9258263b7d6622a812a6c9b9c8c0bcf3de5`
- client: `0.1.0-alpha.64` / Windows
- platform: `win32`
- test ID: `live94-f5e11f90-b74d-40a4-bbe0-9d0acba4da2e`
- outcome: `passed`
- test window: `2026-10-04T11:37:28.749Z → 2026-10-04T11:37:28.773Z`
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 9.4 Layout Persistence and Profiles validation:

- `save-to-disk: PASSED`;
- `restart-reload: PASSED`;
- `desktop-small-profiles: PASSED`;
- `multiple-profiles: PASSED`;
- `undo-redo: PASSED`;
- `reset: PASSED`;
- persistent layouts were enabled: `Persistence:true`;
- actual disk reload was verified: `Disk reload:true`;
- multiple named profiles were exercised;
- separate Desktop / Small-screen layout variants were exercised;
- `gameplayMutation:false`;
- Action Gateway requests: `0`;
- `rawSocketAccess:false`;
- user Script runtime was not touched;
- the diagnostic export was sanitized and contained no reported secret exposure.

Repository/release evidence:

- canonical implementation PR #126 final feature head: `bf3de36980df8934277b5dbbd95d01004f23e78f`;
- final implementation PR CI run `37198816249` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #126 merged with method `merge` into exact implementation main `b466c9258263b7d6622a812a6c9b9c8c0bcf3de5`;
- exact post-implementation-main CI run `37198968039` completed with all four required jobs successful;
- release publish run `37199122283` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.64`, tag `v0.1.0-alpha.64`, GitHub release target, publish-run head, and tested implementation `main` were verified commit-identical at `b466c9258263b7d6622a812a6c9b9c8c0bcf3de5`;
- published assets:
  - Windows x64 installer SHA-256 `40bd9cad8dd6c895e3ed06b244e0b143d44e9ee2fc08d7b64c661490d9761109`
  - Linux x64 installer SHA-256 `4d44af6331cb458a4f500fd7c8afff339bc0ee6e9a13ec0c807e7b10534011ae`
  - updater manifest SHA-256 `6cc3eb0c3c049af86377e67548f4a8875673cec9520af1c0dcfd54928b9a716f`.

**Canonical queue status: Slice 9.4 = VERIFIED.**

Slice 9.5 may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.

---

### Alpha.65 real one-click result: PASSED — Slice 9.5 VERIFIED

Real live report:

- release: `v0.1.0-alpha.65`
- release target / tested implementation main: `de11b27a1b5f5c07b31894edc852104ec9375488`
- client: `0.1.0-alpha.65` / Windows
- platform: `win32`
- test ID: `live95-2655abcc-7452-471a-ae26-5a848df2ce0a`
- outcome: `passed`
- test window: `2026-10-04T12:14:43.273Z → 2026-10-04T12:14:43.300Z`
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 9.5 Dashboard Import/Export validation:

- `role-neutral-export: PASSED`;
- `json-roundtrip: PASSED`;
- `role-mapping: PASSED`;
- `import-persist-reload: PASSED`;
- `cleanup: PASSED`;
- portable export was enabled;
- fixed Character IDs were not exported;
- Character names were not exported;
- role mapping was explicit;
- imported profile persistence and reload were verified;
- `gameplayMutation:false`;
- Action Gateway requests: `0`;
- `rawSocketAccess:false`;
- user Script runtime was not touched;
- the diagnostic export was sanitized and contained no reported secret exposure.

Repository/release evidence:

- implementation PR #129 final feature head: `4f48b7093b0350b9c85ed5f37a019fa3da17d32c`;
- final implementation PR CI run `37200740807` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #129 merged with method `merge` into exact implementation main `de11b27a1b5f5c07b31894edc852104ec9375488`;
- exact post-implementation-main CI run `37200892391` completed with all four required jobs successful;
- release publish run `37201066274` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.65`, tag `v0.1.0-alpha.65`, GitHub release target, publish-run head, and tested implementation `main` were verified commit-identical at `de11b27a1b5f5c07b31894edc852104ec9375488`;
- published assets:
  - Windows x64 installer SHA-256 `eef21e2336079612495a511b4eafce4678464270ca0005e47bd831e4a3a43577`
  - Linux x64 installer SHA-256 `30d964e88aa7e4d49ebde4ab65e7d075e5e9dae3226a04ffb2c4d8b356b4d071`
  - updater manifest SHA-256 `6a8dc504f77d04ef153f4a5218fd46495d4223129e6bf1e569358f4511fa3317`.

**Canonical queue status: Slice 9.5 = VERIFIED.**

Phase 9 – Dashboard Editor is complete through Slice 9.5 once this verification documentation is merged and the exact post-merge `main` CI is fully green. Phase 10 / Slice 10.1 – Renderer Bridge must not begin before that closure gate is complete.

---

### Alpha.66 real one-click result: PASSED — Slice 10.1 VERIFIED

Real live report:

- release: `v0.1.0-alpha.66`
- release target / tested implementation main: `8db64892c53ff1b9bd83186f598b87f73dbe7950`
- client: `0.1.0-alpha.66` / Windows
- platform: `win32`
- test ID: `live101-247ec65e-21fd-4b1a-bf84-262448bc5559`
- outcome: `passed`
- test window: `2026-10-04T12:43:11.325Z → 2026-10-04T12:43:11.394Z`
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 10.1 Renderer Bridge validation:

- `snapshot-schema: PASSED`;
- `stream-connect: PASSED`;
- `sequenced-state-event: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- `read-only-action-gateway: PASSED`;
- `subscriber-cleanup: PASSED`;
- renderer transport: `SSE`;
- renderer mutation API: `false`;
- bridge sequence: `15 → 16 → 16`;
- `coreRestart:false`;
- `characterRestart:false`;
- `scriptRestart:false`;
- `gameplayMutation:false`;
- Action Gateway requests: `0`;
- `rawSocketAccess:false`;
- user Script runtime was not touched;
- the diagnostic export was sanitized and contained no reported secret exposure.

Repository/release evidence:

- implementation PR #131 final feature head: `d65739616fdcb8476d298458c60771379feece63`;
- final implementation PR CI run `37202446668` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #131 merged with method `merge` into exact implementation main `8db64892c53ff1b9bd83186f598b87f73dbe7950`;
- exact post-implementation-main CI run `37202594289` completed with all four required jobs successful;
- release publish run `37202757672` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.66`, tag `v0.1.0-alpha.66`, GitHub release target, publish-run head, and tested implementation `main` were verified commit-identical at `8db64892c53ff1b9bd83186f598b87f73dbe7950`;
- published assets:
  - Windows x64 installer SHA-256 `c9c6f7afffdedb75da9a9dedc3ce9005c1f090f729418eed78e649c404b94c85`
  - Linux x64 installer SHA-256 `ffa078a0fb3402f66d35bdaa1ccafc2d28dfc213264e82416aaba52478c3fc3a`
  - updater manifest SHA-256 `6b56f9c5e7a0ed7797764d7a72547f82bf0e4f42dfbaeeb7da2bc1e103f18d54`.

**Canonical queue status: Slice 10.1 = VERIFIED.**

Slice 10.2 – Browser View may begin only after this verification documentation is merged and the exact post-merge `main` CI is fully green.

---

### Alpha.67 real one-click result: PASSED — Slice 10.2 VERIFIED

Real live report:

- release: `v0.1.0-alpha.67`
- release target / tested implementation main: `0da5b42cb5e9b2c68f65261d13f66622bd51c0f3`
- client: `0.1.0-alpha.67` / Windows
- platform: `win32`
- test ID: `live102-033065dd-80d4-4dd6-ba73-2379b7bfb539`
- outcome: `passed`
- test window: `2026-10-04T13:09:38.967Z → 2026-10-04T13:09:39.045Z`
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 10.2 Browser View validation:

- `browser-open: PASSED`;
- `character-state-rendered: PASSED`;
- `browser-close: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- `read-only-action-gateway: PASSED`;
- Browser View opened and closed successfully;
- renderer transport: `SSE`;
- current Character state was rendered from the existing Renderer Bridge;
- renderer subscribers returned cleanly from `0 → 1 → 0`;
- `coreRestart:false`;
- `characterRestart:false`;
- `scriptRestart:false`;
- `gameplayMutation:false`;
- Action Gateway requests: `0`;
- `rawSocketAccess:false`;
- user Script runtime was not touched;
- the diagnostic export was sanitized and contained no reported secret exposure.

Repository/release evidence:

- implementation PR #133 final feature head: `379c2b85a837192740b2ed9ba211466668006a94`;
- final implementation PR CI run `37204077360` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #133 merged with method `merge` into exact implementation main `0da5b42cb5e9b2c68f65261d13f66622bd51c0f3`;
- exact post-implementation-main CI run `37204255045` completed with all four required jobs successful;
- release publish run `37204416740` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.67`, tag `v0.1.0-alpha.67`, GitHub Release target, publish-run head, and tested implementation `main` were verified commit-identical at `0da5b42cb5e9b2c68f65261d13f66622bd51c0f3`;
- published assets:
  - Windows x64 installer SHA-256 `ab441f7d67dbdfa3ecf16117f6dde126a3d780c4e207b5441dfa1a276fa804a7`
  - Linux x64 installer SHA-256 `ab9c0fe01a777e3f64c5761d5f9928042d3aaa5c34a57a77a3fe0522c4bfccab`
  - updater manifest SHA-256 `9e6085f14f5e51bb5622dcfe4b3301ec1c2aabe3cbdad9017d3c52f9cb6b0441`.

Scope and safety:

- Browser View is read-only;
- it reuses the existing Slice 10.1 Renderer Bridge snapshot/SSE transport;
- no Core, Character, or Script restart is caused by opening or closing the view;
- no gameplay mutation route, Renderer mutation API, raw-socket shortcut, or user Script replacement was introduced;
- Slice 10.3 Control Modes and Slice 10.4 live Headless/Browser handoff were not pulled forward.

**Canonical queue status: Slice 10.2 = VERIFIED.**

Slice 10.3 – Control Modes may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.

---

### Alpha.68 real one-click result: PASSED — Slice 10.3 VERIFIED

Real live report:

- release: `v0.1.0-alpha.68`
- release target / tested implementation main: `1214cda8e62d318824f60cea51d9b60009c629c7`
- client: `0.1.0-alpha.68` / Windows
- platform: `win32`
- test ID: `live103-f0b2d8de-1475-4875-8718-2fdc21c7a523`
- outcome: `passed`
- test window: `2026-10-04T13:37:22.826Z → 2026-10-04T13:37:22.860Z`
- diagnostic export: 28 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 10.3 Control Modes validation:

- `automatic-policy: PASSED`;
- `assist-policy: PASSED`;
- `manual-policy: PASSED`;
- `user-actions-through-gateway: PASSED`;
- `mode-restored: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- verified modes: Automatic, Assist, Manual;
- starting mode: `automatic`;
- restored mode: `automatic`;
- explicit user actions were verified through the Action Gateway;
- Action Gateway verification probes: `8`;
- Automatic accepted script and dashboard probes;
- Assist blocked script origin with `CONTROL_MODE_SCRIPT_BLOCKED` while accepting system and dashboard probes;
- Manual blocked script origin with `CONTROL_MODE_SCRIPT_BLOCKED` and system origin with `CONTROL_MODE_SYSTEM_BLOCKED` while accepting the dashboard probe;
- all probes were non-gameplay verification actions;
- `coreRestart:false`;
- `characterRestart:false`;
- `scriptRestart:false`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- user Script runtime was not touched;
- the diagnostic export was sanitized and contained no reported secret exposure.

Repository/release evidence:

- implementation PR #135 final feature head: `aa96d830b4979241d46d9c7dd7cbf8852723b9f1`;
- final implementation PR CI run `37205646028` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #135 merged with method `merge` into exact implementation main `1214cda8e62d318824f60cea51d9b60009c629c7`;
- exact post-implementation-main CI run `37205869011` completed with all four required jobs successful;
- release publish run `37206002263` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.68`, tag `v0.1.0-alpha.68`, GitHub Release target, publish-run head, and tested implementation `main` were verified commit-identical at `1214cda8e62d318824f60cea51d9b60009c629c7`;
- published assets:
  - Windows x64 installer SHA-256 `4c3bdf534fdd2fed2e8c0419de5574a8e3152edf9ecc6b0e8fb54adf10385971`
  - Linux x64 installer SHA-256 `4a706050fd07f940fdaad2a5216a29c5610546cc1ea9d78f71c1a1007cc89cdd`
  - updater manifest SHA-256 `b7cfc02eaaa08eee125ee984d8538a133c43e5ac53c0b125b1cdf2cd265c7e87`.

Scope and safety:

- mode enforcement is centralized in the Action Gateway;
- explicit user gameplay actions remain Action Gateway actions;
- mode changes do not stop, replace, or restart the running user Script or Character;
- no raw-socket shortcut, renderer ownership transfer, or Headless ↔ Browser socket handoff was introduced;
- Slice 10.4 remains out of scope.

**Canonical queue status: Slice 10.3 = VERIFIED.**

Slice 10.4 – Headless ↔ Browser Live Handoff may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.

---

### Alpha.69 real one-click result: PASSED — Slice 10.4 VERIFIED

Real live report:

- release: `v0.1.0-alpha.69`
- release target / tested implementation main: `14d5f4e3cc8e33e69aefa620a115f0ba35fe5d39`
- client: `0.1.0-alpha.69` / Windows
- platform: `win32`
- test ID: `live104-a0d81974-84de-46ae-8171-e3e92e1e3a75`
- outcome: `passed`
- test window: `2026-10-04T14:22:04.712Z → 2026-10-04T14:22:04.799Z`
- diagnostic export: 34 log lines, `Secrets sanitized: yes`.

The accepted one-click harness completed the full Slice 10.4 live handoff validation:

- `headless-socket-ready: PASSED`;
- `renderer-attach: PASSED`;
- `socket-continuity-browser: PASSED`;
- `script-continuity-browser: PASSED`;
- `renderer-detach: PASSED`;
- `socket-preserved: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- `soft-handoff-policy: PASSED`;
- `no-gameplay-action: PASSED`;
- renderer transport: `SSE`;
- renderer mode: `headless → browser → headless`;
- renderer subscribers: `0 → 1 → 0`;
- attached renderers: `0 → 1 → 0`;
- socket ownership: `headless-core`;
- socket strategy: `preserve`;
- socket preserved: `true`;
- reconnect fallback: `soft-handoff`;
- soft handoff used: `false`;
- `coreRestart:false`;
- `characterRestart:false`;
- `scriptRestart:false`;
- `gameplayMutation:false`;
- test-generated Action Gateway requests: `0`;
- `rawSocketShortcut:false`;
- user Script runtime was not touched by the verification harness.

Running-script evidence:

- the real headless Character `My_Ranger1` was connected on `SR_EUII`;
- `simple-farmer-template` started with run ID `script-df4b578d-148f-4236-8daa-8aa29b257a6d`;
- the Script was actively issuing successful Action Gateway attacks immediately before the handoff test;
- snapshot continuity checks passed across Browser attach/detach with no Script restart;
- the user explicitly accepted this Alpha.69 run as the canonical fully-passed live verification.

Repository/release evidence:

- implementation PR #137 final feature head: `e36f51b90a05ee90f0426e5584abe0106ba83b15`;
- final implementation PR CI run `37207707303`: all four required jobs successful;
- implementation main: `14d5f4e3cc8e33e69aefa620a115f0ba35fe5d39`;
- exact post-implementation-main CI run `37207876721`: all four required jobs successful;
- release publish run `37208027223`: Linux, Windows, and GitHub Release successful;
- release branch, tag, release target, publish head, and tested implementation main are commit-identical at `14d5f4e3cc8e33e69aefa620a115f0ba35fe5d39`;
- Windows x64 installer SHA-256: `c8313024a53cad9cd239a860ec8840d5ee743b27bac803bc7696d4def20ba431`;
- Linux x64 installer SHA-256: `4f64783d5cb1af1561af105c28d590264bc5dff1c04790c4001ffae941d41e02`;
- updater manifest SHA-256: `69852fd6948642780818f7c97de2b52df4d34c5dfc35ef32a8b98f1801df9a9b`.

Scope and safety:

- Browser attach/detach uses the existing Renderer Bridge SSE transport;
- the headless Core retains Character socket ownership;
- no reconnect was required in the accepted active-socket test;
- a future reconnect-required public-browser takeover is constrained to soft handoff rather than Bot-process restart;
- no gameplay mutation route, raw-socket shortcut, Action Gateway bypass, or user Script replacement was introduced;
- superseded PR #138 was closed without merge.

**Canonical queue status: Slice 10.4 = VERIFIED.**

Phase 11 / Slice 11.1 – ALHD Asset Provider may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.

---

### Alpha.70 real one-click result: PASSED — Slice 11.1 VERIFIED

Real live report:

- release: `v0.1.0-alpha.70`
- release target / tested implementation main: `6f5f8c47510b353646860048e3278d5fcfc3e269`
- client: `0.1.0-alpha.70` / Windows
- platform: `win32`
- test ID: `live111-9ad30e4e-66b4-49e6-a1cc-c6a79225688a`
- outcome: `passed`
- test window: `2026-10-04T14:57:05.063Z → 2026-10-04T14:57:05.071Z`
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 11.1 validation:

- `manifest-loaded: PASSED`;
- `presentation-only: PASSED`;
- `known-original-fallback: PASSED`;
- `unknown-original-fallback: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- `read-only-runtime: PASSED`;
- provider status: `ready`;
- manifest status: `loaded`;
- manifest schema: `1`;
- manifest phase: `4-vertical-pilot`;
- manifest source: `Riflex91/Riflex91-Repo@43bcdee99ab12a92f7cbf8e7bcdac8f0e99983f2/Adventure Land HD/manifests/hd-assets.json`;
- replacements: `2`;
- active replacements: `2`;
- packaged HD files available: `0`;
- missing packaged HD files: `2`;
- `presentationOnly:true`;
- `originalFallback:true`;
- `gameplaySemanticChanges:false`;
- known source resolution: `original / hd-file-missing`;
- unknown source resolution: `original / not-in-manifest`;
- `coreRestart:false`;
- `characterRestart:false`;
- `scriptRestart:false`;
- `dashboardGetOnly:true`;
- `gameplayMutation:false`;
- Action Gateway requests: `0`;
- `rawSocketAccess:false`;
- user Script runtime was not touched.

Repository/release evidence:

- implementation PR #140 final feature head: `fa69a8e50d7f145b77e5b59705f6d63f2e333831`;
- final implementation PR CI run `37210560345`: all four required jobs successful;
- implementation main: `6f5f8c47510b353646860048e3278d5fcfc3e269`;
- exact post-implementation-main CI run `37210737660`: all four required jobs successful;
- release publish run `37210929441`: Linux, Windows, and GitHub Release successful;
- release branch, tag, release target, publish head, and tested implementation main are commit-identical at `6f5f8c47510b353646860048e3278d5fcfc3e269`;
- Windows x64 installer SHA-256: `b87009f767aa20c37948210ab333ad49d7b59fbd965a48a65fdb4924b8cc176d`;
- Linux x64 installer SHA-256: `7562cf7a17fba4b05423dfa6c85b756ce3824a652e50545d50ac653583d94fc1`;
- updater manifest SHA-256: `2678ed35e79cff1a862e95d71dd777c681a30427674537da354f72485f0a7627`.

Scope and safety:

- ALHD provider is read-only and presentation-only;
- original Adventure Land assets remain authoritative fallback;
- Alpha.70 intentionally packages no HD replacement files, so both active manifest entries validate the original fallback path;
- no gameplay semantic changes, gameplay mutation, raw socket access, or user Script replacement occurred;
- WebGL guard, HD Browser defaults/application, and graphics profiles remain out of scope.

**Canonical queue status: Slice 11.1 = VERIFIED.**

Slice 11.2 – WebGL Texture-Size Guard may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.

---

### Alpha.71 real one-click result: PASSED — Slice 11.2 VERIFIED

Real live report:

- release: `v0.1.0-alpha.71`
- release target / tested implementation main: `37cdd90027e697e6df642e44e13be9d37a94b4c0`
- client: `0.1.0-alpha.71` / Windows
- platform: `win32`
- test ID: `live112-9079e8e2-8a63-4e67-9a7d-d1747fdd2dfb`
- outcome: `passed`
- test window: `2026-10-04T15:22:59.614Z → 2026-10-04T15:22:59.625Z`
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 11.2 validation:

- `webgl-max-texture-size: PASSED`;
- `texture-guard-diagnostics: PASSED`;
- `oversized-original-fallback: PASSED`;
- `actual-hardware-resolution: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- `read-only-runtime: PASSED`;
- WebGL context: `webgl`;
- detected `MAX_TEXTURE_SIZE: 16384`;
- `WEBGL_lose_context available: true`;
- `Temporary context released: true`;
- guard available assets: `2`;
- guard eligible assets: `2`;
- guard blocked assets: none;
- `Hardware suitable for active ALHD assets: true`;
- forced guard limit: `1024`;
- forced oversized resolution: `original / texture-too-large`;
- actual hardware resolution: `original / hd-file-missing`;
- `presentationOnly:true`;
- `originalFallback:true`;
- `coreRestart:false`;
- `characterRestart:false`;
- `scriptRestart:false`;
- `dashboardGetOnly:true`;
- `gameplayMutation:false`;
- Action Gateway requests: `0`;
- `rawSocketAccess:false`;
- user Script runtime was not touched.

Repository/release evidence:

- implementation PR #142 final feature head: `f222a797cf596f99ab88bf407c2a53f47590a812`;
- final implementation PR CI run `37212162287`: all four required jobs successful;
- implementation main: `37cdd90027e697e6df642e44e13be9d37a94b4c0`;
- exact post-implementation-main CI run `37212357296`: all four required jobs successful;
- release publish run `37212538843`: Linux, Windows, and GitHub Release successful;
- release branch, tag, release target, publish head, and tested implementation main are commit-identical at `37cdd90027e697e6df642e44e13be9d37a94b4c0`;
- Windows x64 installer SHA-256: `2fdab267a373aaa6320e387a152753e2aefbe3d4ae855d142f7156aadc42b88f`;
- Linux x64 installer SHA-256: `0361bae4a1e4df00fe9a473266a441095e734c525374a5e6f961b74175e91e29`;
- updater manifest SHA-256: `0d080173f53a663a2fb9422b8bf756fe77b9c11f65cf3ce472ab65a4acd00860`.

Scope and safety:

- real browser WebGL capability was detected without retaining a rendering context;
- hardware-unsuitable HD content is blocked on the original asset path;
- actual Windows hardware was suitable for both current active ALHD entries;
- diagnostics remain GET-only and presentation-only;
- no gameplay semantic changes, gameplay mutation, raw socket access, or user Script replacement occurred;
- HD Browser default/application and graphics profiles remain out of scope.

**Canonical queue status: Slice 11.2 = VERIFIED.**

Slice 11.3 – HD Standard im Browser-Renderer may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.



---

### Alpha.72 real one-click result: PASSED — Slice 11.3 VERIFIED

Real live report:

- release: `v0.1.0-alpha.72`
- release target / tested implementation main: `b421164b3b5435e0e9be0e95f2d1e977c742e662`
- client: `0.1.0-alpha.72` / Windows
- platform: `win32`
- test ID: `live113-97ffa307-040f-42c1-bcf4-42b36d34fccb`
- outcome: `passed`
- test window: `2026-10-04T16:00:27.921Z → 2026-10-04T16:00:28.134Z`
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 11.3 validation:

- `headless-no-hd-payload: PASSED`;
- `browser-hd-default: PASSED`;
- `browser-hd-status: PASSED`;
- `browser-hd-payload-loaded: PASSED`;
- `browser-renderer-attached: PASSED`;
- `runtime-continuity-browser: PASSED`;
- `browser-renderer-detached: PASSED`;
- `headless-stays-metadata-only: PASSED`;
- `core-character-script-continuity: PASSED`;
- `read-only-runtime: PASSED`;
- Browser graphics mode: `HD`;
- available HD assets: `2`;
- applied HD assets: `1`;
- applied path: `images/tiles/characters/jubchan_1.png`;
- missing HD path: `images/tiles/map/doors.png`;
- blocked HD paths: none;
- texture limit: `16384`;
- WebGL context: `webgl`;
- `Temporary context released: true`;
- Headless payload reads before Browser: `0`;
- Headless payload reads stable before Browser: `0`;
- Browser HD payload reads: `1`;
- Browser HD payload bytes: `761458`;
- `Headless loads HD assets: false`;
- `Presentation only: true`;
- `Original fallback: true`;
- Renderer subscribers: `0 → 1 → 0`;
- `Core restart: false`;
- `Character restart: false`;
- `Script restart: false`;
- `Gameplay mutation: false`;
- Action Gateway requests: `0`;
- `Raw socket access: false`;
- `User Script touched: false`.

Repository/release evidence:

- implementation PR #144 final feature head: `e4fc6ae797f0c94c530848a56a54768a57b28581`;
- final implementation PR CI run `37214393644`: all four required jobs successful;
- implementation main: `b421164b3b5435e0e9be0e95f2d1e977c742e662`;
- exact post-implementation-main CI run `37214595244`: all four required jobs successful;
- release publish run `37214841618`: Linux, Windows, and GitHub Release successful;
- release branch, tag, release target, publish head, and tested implementation main are commit-identical at `b421164b3b5435e0e9be0e95f2d1e977c742e662`;
- Windows x64 installer SHA-256: `e0edce0dcca48d4fc8556df2cee776bba36bab6dabdb6ea0885067109f8f54b4`;
- Linux x64 installer SHA-256: `4d06d6363f9d798e2a8013279f920ddc6ae3adf9a04de9c1891b93d85c8bcbb4`;
- updater manifest SHA-256: `8474ca73072d0b976a82c8661e91f484086b253476169a7d2470aa8bdd39a67f`.

Scope and safety:

- Browser rendering defaults to HD while retaining the original Adventure Land asset as fallback;
- the packaged Jubchan pilot was actually loaded and applied;
- the intentionally missing doors HD payload correctly stayed on the original asset;
- the WebGL texture guard remains active with detected limit `16384`;
- Headless loaded no HD payload data and remained metadata-only;
- Renderer Bridge subscribers returned from `0` to `1` to `0` without runtime restart;
- no gameplay semantic changes, gameplay mutation, raw socket access, Action Gateway requests, or user Script replacement occurred;
- Slice 11.4 graphics profiles remain out of scope.

**Canonical queue status: Slice 11.3 = VERIFIED.**

Slice 11.4 – Graphics Profiles may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.


---

### Alpha.73 real one-click result: PASSED — Slice 11.4 VERIFIED

Real live report:

- release: `v0.1.0-alpha.73`
- release target / tested implementation main: `7477bb26967164e46372a420b73be6673d6b0931`
- client: `0.1.0-alpha.73` / Windows
- platform: `win32`
- test ID: `live114-b5ffdb37-4d41-4ffc-aaa6-a3e317f0c6b0`
- outcome: `passed`
- test window: `2026-10-04T16:31:45.732Z → 2026-10-04T16:31:45.968Z`
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 11.4 validation:

- `headless-no-hd-payload: PASSED`;
- `browser-profile-default-auto: PASSED`;
- `profile-original: PASSED`;
- `profile-hd-performance: PASSED`;
- `profile-hd-auto: PASSED`;
- `profile-hd-maximum: PASSED`;
- `profile-switch-renderer-reinitialized: PASSED`;
- `core-character-script-continuity-during-switch: PASSED`;
- `browser-renderer-detached: PASSED`;
- `headless-stays-metadata-only: PASSED`;
- `core-character-script-continuity: PASSED`;
- `read-only-runtime: PASSED`;
- profile sequence: `hd-auto → original → hd-performance → hd-auto → hd-maximum → hd-auto`;
- Renderer generations: `1 → 2 → 3 → 4 → 5 → 6`;
- hardware texture limit: `16384`;
- Original applied HD assets: `0`;
- HD Performance applied assets: `1`;
- HD Auto applied assets: `1`;
- HD Maximum applied assets: `1`;
- Original texture limit: `original-only`;
- HD Performance texture limit: `2048`;
- HD Auto texture limit: `4096`;
- HD Maximum texture limit: `16384`;
- Original payload read delta: `0`;
- Browser HD payload reads: `5`;
- Browser HD payload bytes: `3807290`;
- `Headless loads HD assets: false`;
- `Presentation only: true`;
- `Original fallback: true`;
- Renderer subscribers: `0 → 1 → 1 → 0`;
- `Core restart: false`;
- `Character restart: false`;
- `Script restart: false`;
- `Gameplay mutation: false`;
- Action Gateway requests: `0`;
- `Raw socket access: false`;
- `User Script touched: false`.

Repository/release evidence:

- implementation PR #146 final feature head: `2f84574a772fb7ab50996129032ca4c656f58a1e`;
- final implementation PR CI run `37216602521`: all four required jobs successful;
- implementation main: `7477bb26967164e46372a420b73be6673d6b0931`;
- exact post-implementation-main CI run `37216749104`: all four required jobs successful;
- release publish run `37216917511`: Linux, Windows, and GitHub Release successful;
- release branch, tag, release target, publish head, and tested implementation main are commit-identical at `7477bb26967164e46372a420b73be6673d6b0931`;
- Windows x64 installer SHA-256: `fede5369662a05d8ff75b77e70a6d84a3c33adba972f20968ac9f4665224fc0f`;
- Linux x64 installer SHA-256: `d305e472c41d724a7ea964f1f8a116f4ba407f5f2f2c149e9afb88fd9c78a76f`;
- updater manifest SHA-256: `3229985b38256d6ba37fdb6b2bb10932253d384d2dd7091218bee0f48a3ce87b`.

Scope and safety:

- Original, HD Performance, HD Auto, and HD Maximum all passed on the real installed Windows client;
- Original loaded no HD payloads;
- Performance, Auto, and Maximum used their intended effective texture limits while retaining the real hardware guard;
- Browser graphics-layer generations advanced exactly once per profile application without replacing the Renderer Bridge subscriber;
- Core, Character, and Script remained continuous through all profile switches and after Browser close;
- Headless remained metadata-only;
- original Adventure Land assets remain fallback;
- no gameplay semantic changes, gameplay mutation, raw socket access, Action Gateway requests, or user Script replacement occurred.

**Canonical queue status: Slice 11.4 = VERIFIED. Phase 11 = VERIFIED.**

Phase 12 / Slice 12.1 – Paketformat may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.


---

### Alpha.74 real one-click result: PASSED — Slice 12.1 VERIFIED

Real live report:

- release: `v0.1.0-alpha.74`
- release target / tested implementation main: `ace18295bf85b5459171c7261c1ea119a8b7c2e1`
- client: `0.1.0-alpha.74` / Windows
- platform: `win32`
- test ID: `live121-c164210e-ccfd-42a4-9965-d9f8de887f35`
- outcome: `passed`
- test window: `2026-10-04T16:58:04.685Z → 2026-10-04T16:58:04.694Z`
- diagnostic export: 12 log lines, `Secrets sanitized: yes`.

The one-click harness completed the full Slice 12.1 validation:

- `package-format-descriptor: PASSED`;
- `manifest-required-fields: PASSED`;
- `package-structure-valid: PASSED`;
- `sha256-integrity: PASSED`;
- `tamper-rejected: PASSED`;
- `config-readme-scripts: PASSED`;
- `metadata-compatibility-permissions: PASSED`;
- `declaration-only-no-import-execution: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- `read-only-runtime: PASSED`;
- package format: `alremastered-script-package`;
- file extension: `.alrpkg`;
- schema version: `1`;
- hash algorithm: `sha256`;
- package sections: `manifest, files, hashes`;
- required manifest fields: `id, name, version, author, compatibility, permissions, scripts, configSchema, readme`;
- fixture package ID: `org.alremastered.slice121-fixture`;
- fixture version: `1.0.0`;
- fixture author: `ALRemastered Verification`;
- minimum ALRemastered: `0.1.0-alpha.74`;
- declared permissions: `movement, combat`;
- script count: `2`;
- entry script: `scripts/main.js`;
- Config Schema: `config.schema.json`;
- README: `README.md`;
- file count: `4`;
- package text bytes: `266`;
- manifest SHA-256: `58409b23fb92d2c13e70cb46f2337ab97087aef03ae48c2e386120472c8b88d2`;
- `Tamper rejected: true`;
- tamper error: `PACKAGE_HASH_MISMATCH`;
- `Permission enforcement: false`;
- `Package import attempted: false`;
- `Package execution attempted: false`;
- `Core restart: false`;
- `Character restart: false`;
- `Script restart: false`;
- `Dashboard GET only: true`;
- `Gameplay mutation: false`;
- Action Gateway requests: `0`;
- `Raw socket access: false`;
- `User Script touched: false`.

Repository/release evidence:

- implementation PR #148 final feature head: `628fa59ac35104a4fc6470595c28ad1de6e613ad`;
- final implementation PR CI run `37218200401`: all four required jobs successful;
- implementation main: `ace18295bf85b5459171c7261c1ea119a8b7c2e1`;
- exact post-implementation-main CI run `37218346069`: all four required jobs successful;
- release publish run `37218502852`: Linux, Windows, and GitHub Release successful;
- release branch, tag, release target, publish head, and tested implementation main are commit-identical at `ace18295bf85b5459171c7261c1ea119a8b7c2e1`;
- Windows x64 installer SHA-256: `0a0e0b39238b8a1fea5eee3947f77e8e59b2fc866a79d3384ea90e255031ad44`;
- Linux x64 installer SHA-256: `a4085e128ba62a4801dbb487c5b06180e5053fcd294f12a4ca9b88a765649c2f`;
- updater manifest SHA-256: `493c75814fa8e129c3d1a9f59b8c2ccfb91691de31a31ea3b6608991788acafd`.

Scope and safety:

- the real Windows client validated the complete Slice 12.1 package container contract;
- required Manifest, Scripts, Config Schema, README, Version, Author, Compatibility, permission declarations, and hashes are present;
- SHA-256 integrity validation passed and deliberate content tampering was rejected;
- permission declarations are not enforced yet;
- no package import or package execution occurred;
- the format test is read-only and generated only local in-memory fixture data;
- Core, Character, and Script remained continuous;
- no gameplay mutation, raw socket access, Action Gateway requests, or user Script replacement occurred.

**Canonical queue status: Slice 12.1 = VERIFIED.**

Slice 12.2 – Permission System may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.
