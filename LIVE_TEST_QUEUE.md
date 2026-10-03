# Live Test Queue

This queue is append-only evidence planning for merged slices that still require a real user live test. A queued slice is **not VERIFIED** until the user performs the listed installed-client test and supplies the resulting logs/evidence.

## Queue order

1. Slice 3.2 – Move / XMove – `v0.1.0-alpha.22`
2. Slice 3.3 – Attack – `v0.1.0-alpha.23`
3. Slice 3.4 – Skills – `v0.1.0-alpha.24`

---

## Slice 3.2 – Move / XMove

**Status: MERGED – AWAITING USER TEST**

- Release version: `v0.1.0-alpha.22`
- Update from: `v0.1.0-alpha.21`
- Character/class: any normal connected character; use a character standing in an open, low-risk area
- Server: the user's normal selected Adventure Land server
- Safety boundary: only the fixed 32-unit dashboard controls are allowed; do not use external scripts or repeated clicking
- Expected mutation path: Dashboard → central Action Gateway → geometry validation → official `move` socket event
- XMove scope in this slice: direct path only; if pathfinding would be needed, the request must fail with `XMOVE_PATH_REQUIRED` and send no movement packet

### Dashboard steps

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
