# IQ QUEST V5.43 — Devnet atomic publication test

## GitHub Pages update (same current repository)

Upload the files in this release ZIP to **the same relative paths** in your
`iq-quest` repository, replacing the earlier copies:

- `creator.html`
- `onchain-bridge.js`
- `devnet-resumable.mjs`
- `payments/atomic-final-devnet.mjs` (inside the existing `payments` folder)

Keep `index.html`, `quest-cover.mjs`, `my-quests.mjs`, the images and all other
existing GitHub files. Do NOT upload the ZIP itself as a webpage. On a phone,
extract the ZIP first. After GitHub Pages updates, reload the creator page.

## How to test

1. Open `creator.html#studio` in Phantom's in-app browser and switch Phantom
   to **Solana Devnet** (not Mainnet). Have at least 0.03 *test* SOL plus
   Devnet storage/network fees in the test wallet. A separate creator test
   wallet from the platform recipient lets you observe the transfer clearly.
2. Create/review a fresh complete 15-question quest, with answers and hints.
   Preview it for free; no wallet is needed for creating/testing.
3. In Step 3, read the gold **DEVNET ONLY** panel and check the explicit
   consent box. Press **TEST 0.03 DEVNET SOL + PUBLISH ONCHAIN**.
4. Connect Phantom and approve every distinct IQ Labs chunk. The *final*
   wallet approval contains BOTH official IQ Labs final registration and a
   System Program transfer of exactly 0.03 Devnet SOL to the shown recipient.
   Earlier storage/network fees are separate and variable.
5. Wait for the independent finalized receipt check and exact 15-question IQ
   Labs readback. Only then should the shareable game link appear.

If Phantom reloads after a wallet approval, keep the SAME wallet, browser and
unchanged quest. After allowing confirmation time, press the SAME gold button
to verify and resume the saved job. Never authorize a second test transfer
simply because the page returned or a public Devnet RPC was delayed. A
pending transaction that cannot be conclusively found remains blocked rather
than automatically retried.

The gold test is explicitly **Devnet-only**. Real Mainnet creator checkout is
still disabled. The previous separate 0.002 Devnet rehearsal and free
storage-only workflow remain available; they do not count as the new atomic
0.03 Devnet test. The code passes local mocked unit tests, but a complete
live Phantom/Devnet transaction has NOT been executed by the developer yet.

## Later move to IQ Labs GitHub

This release is prepared to be copied to an explicitly approved destination
repository once the IQ Labs GitHub owner and permissions are known. See
`MIGRATION-TO-IQLABS-GITHUB.md` for the checklist. No organization-owned
repository was changed here. Existing Solana transaction signatures do not
need to be paid for or uploaded a second time due to a GitHub migration.
