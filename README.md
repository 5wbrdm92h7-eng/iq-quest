# IQ QUEST — clean collaboration source

This is a functional, source-code copy of the original IQ QUEST web game and its
full Quest Creator, prepared for a potential collaboration with IQLabs.

## What is included

- The original game interface and playable Easy, Medium and Hard quests.
- The original Creator Studio to build and test custom quests.
- Solana wallet integration and the existing **Devnet** publishing flow.
- Battle content, local game assets, quest data, payment-related modules,
  and the supporting JavaScript modules used by the original application.

The original game's interface, game rules and Creator workflow have not been
redesigned or simplified in this copy.

## Review and collaboration changes

- `imprint.html` is not included; navigation links to it were removed.
- Personal operator name, postal address and contact email have been cleared
  from `legal-config.mjs`.
- The remaining privacy and withdrawal pages currently contain incomplete
  legal details. They are **not** final launch-ready legal documents.
- No repository history, `.git` directory, wallet secret, private key, API
  credential or personal authentication token is intentionally included.

**Important:** An imprint may be legally required for a commercial public
launch, depending on applicable jurisdiction. The omission here is for source
review/collaboration, not a legal exemption.

## How to run

This is a static website. Serve this directory with any static HTTP server,
then open `index.html`. For example:

```bash
python3 -m http.server 8000
```

Visit `http://localhost:8000/` to play, or `creator.html` to create a quest.
For GitHub Pages, put these files at the root of a new repository and publish
the `main` branch's root directory through the repository's Pages settings.

Opening the HTML directly using `file://` is not equivalent to a static server:
browser security restrictions can prevent modules or JSON files from loading.

## Onchain status and security

- **Mainnet payments are disabled in the original build.** Do not enable them
  without an independent security, payment-flow and legal review.
- The original Creator's Devnet flow can request wallet signatures and a
  **0.03 Devnet test-SOL** transfer as part of publication. Devnet tokens do
  not represent real SOL, but user approval is still required for signing.
- The game uses external blockchain endpoints/libraries. Hosting these static
  files on IPFS or a blockchain does **not** alone make all dependencies,
  game state, services and integrations fully onchain.
- Audit signing requests, checkout modules, RPC dependencies, and third-party
  asset/library licenses before any production integration.

## Suggested next steps for IQLabs

1. Run and review the game and Creator, preserving current behavior.
2. Verify/optimize the file layout for onchain publishing and external
   dependency loading.
3. Review wallet signing, Devnet publishing and payment code.
4. Define an upgrade and monetization plan jointly with the project creator.
5. Agree in writing on ownership, access, revenue sharing and cost allocation
   **before** deploying a revenue-generating Mainnet version.

This package is provided for technical evaluation. It does not itself transfer
ownership, grant exclusive rights, or constitute a signed partnership agreement.
