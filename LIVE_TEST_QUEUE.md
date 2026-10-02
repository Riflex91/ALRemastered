# Live Test Queue

This queue is append-only evidence planning for merged slices that still require a real user live test. A queued slice is **not VERIFIED** until the user performs the listed installed-client test and supplies the resulting logs/evidence.

## Queue order

1. Slice 3.2 – Move / XMove – `v0.1.0-alpha.22`

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
