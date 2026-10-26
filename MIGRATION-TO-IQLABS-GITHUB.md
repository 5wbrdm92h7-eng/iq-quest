# Future IQ QUEST move to IQ Labs GitHub — permission required

IQ Labs' public GitHub organization associated with `@IQLabsOfficial` appears as https://github.com/IQCoreTeam . Its onchain storage SDK is https://github.com/IQCoreTeam/iqlabs-solana-sdk . These public repositories are maintained by their owners; this package does **not** grant access or imply partnership.

## Safe handoff steps once you receive explicit permission

1. Identify the exact destination: a new IQ Labs-owned IQ QUEST repository, a fork, or a pull request against an existing repo. Ask the organization's maintainers for the approved path and write permissions. Do not force-push or overwrite their SDK repository.
2. Keep your current `5wbrdm92h7-eng/iq-quest` repository intact and make a versioned backup/commit; preserve its historical branches and release ZIPs.
3. Transfer the **source** and test suite in a reviewed pull request or supported GitHub repository-transfer workflow, as directed by the destination's maintainers. Never include secrets, recovery phrases or private RPC credentials.
4. Update the Pages domain, absolute OG/social metadata, app API origin, allowed CORS origin, README, imprint/privacy controller if the operator changed, and any domain-specific support links.
5. Test direct IQ Labs onchain player links, Devnet support, draft/editor, wallet chooser, payment shutdown gates and backend account ownership after transfer. A repository transfer is NOT a blockchain transaction and does not move wallet funds.
6. GitHub Pages links already shared on X may contain the OLD hostname and a permanent Solana transaction signature. Keep the old site live or configure an explicit redirect so old player links do not suddenly break. Changing the GitHub repository does not require uploading existing puzzles again to Solana.
7. Browser localStorage does NOT migrate to a new domain automatically. Before moving, save creator draft exports and onchain transaction links. On the new site, use My Quests' public-wallet search or verified transaction-link recovery to rediscover published quests.
8. IQ QUEST V5.43's 0.03 Devnet-SOL atomic test recipient is a hardcoded public wallet address in `payments/atomic-final-devnet.mjs`. An organization migration does not itself transfer ownership of that wallet; verify the authorized future recipient and legal operator before any production payment launch. Keep Mainnet disabled until specifically reviewed and approved.

This is a migration plan only. No GitHub organization invitation, agreement or credentials were provided, so no external repository was modified.
