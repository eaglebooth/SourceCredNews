# SourceCred News

SourceCred News is a funded public-claim verification market on GenLayer. Claim creators lock real GEN behind a factual statement; an independent contributor submits two web sources; GenLayer validators decide the substantive verdict and payout band before the contract transfers escrow.

**Why it dies without GenLayer:** the product is an on-chain, money-bearing judgment about whether independent public sources support or contradict a claim. A single API or administrator should not control that verdict or payout.

## Deployment Status

The payable contract and frontend are connected to the verified Studionet deployment below. The retired deployment is not referenced by the tracked application configuration.

- Live app after deployment: https://sourcecred-news.vercel.app
- Repository: https://github.com/eaglebooth/SourceCredNews
- Network: GenLayer Studionet
- Contract: [`0xfcfE88c93d284A00F19C7B1f7168c4A286325131`](https://explorer-studio.genlayer.com/address/0xfcfE88c93d284A00F19C7B1f7168c4A286325131)

## Complete Flow

1. **Fund:** a connected wallet calls payable `create_claim`; `gl.message.value` becomes contract-held escrow and the transaction sender becomes the creator.
2. **Source:** a different wallet calls `submit_evidence` with two HTTPS URLs from different hosts. The contributor identity comes from `gl.message.sender_address`.
3. **Judge:** `evaluate_evidence` renders both pages on-chain and asks the GenLayer jury for a verdict and payout band.
4. **Settle:** `settle_reward` transfers reserved GEN to the recorded contributor. If no payout is reserved, only the authenticated creator can close and recover available escrow.

The frontend exposes one primary action at a time based on live contract state. It never fabricates demo records and it verifies every accepted write by polling the expected state transition.

## Contract Design

- Real payable custody using `@gl.public.write.payable` and `gl.message.value`.
- Real payout and refund calls via the recipient EVM interface.
- Creator and contributor roles derived from transaction senders, never supplied as form fields.
- Two-source provenance guard: URLs must use HTTPS and resolve to different hosts.
- Web evidence read with `gl.nondet.web.render` inside the nondeterministic jury function.
- AI review via `gl.nondet.exec_prompt(..., response_format="json")`.
- Semantic consensus with `gl.eq_principle.prompt_comparative`; validators must agree on both verdict and payout band while harmless prose variations are allowed.
- Explicit lifecycle guards prevent duplicate evidence, duplicate evaluation, double payout and unauthorized refund.
- Deterministic views expose platform, claim and evidence state as sorted JSON.

## Structure

```text
SourceCredNews/
  contracts/SourceCredNews.py
  frontend/src/app/page.tsx
  frontend/src/lib/genlayer.ts
  tests/test_contract_static.py
  tests/test_frontend_static.py
  scripts/deploy/deploy.ps1
```

## Verify Locally

```powershell
python -m unittest discover -s tests -v
python -c "import ast; ast.parse(open('contracts/SourceCredNews.py', encoding='utf-8').read())"

cd frontend
npm install
npm run lint
npm run build
npm run dev
```

The static tests specifically reject the recurring failure modes seen in earlier reviews: `strict_eq` around free-form reasoning, spoofable role parameters, missing payable custody, ledger-only payouts, `FINALIZED` polling on Studionet, fake frontend data and unbounded parallel RPC reads.

## Deploy Contract

Run these steps manually after the local review:

```powershell
genlayer lint contracts/SourceCredNews.py
genlayer deploy contracts/SourceCredNews.py --name SourceCredNews
```

Then place the new address in all frontend environments:

```text
NEXT_PUBLIC_CONTRACT_ADDRESS=0xfcfE88c93d284A00F19C7B1f7168c4A286325131
NEXT_PUBLIC_NETWORK=studionet
NEXT_PUBLIC_GENLAYER_RPC=
```

The Contract workspace also accepts a runtime address override stored in the browser. This lets a reviewer test a custom deployment without rebuilding the app.

## Reviewer Test Script

Use two funded wallets because the creator cannot submit evidence to their own claim.

1. Connect wallet A, open a claim and attach a small GEN escrow.
2. Connect wallet B, open the live claim and submit two independent source URLs.
3. Run the source jury and wait for the accepted transaction to appear in contract state.
4. If the packet is approved, settle the reward and verify the contract balance and paid total change.
5. For a rejected or unclear packet, reconnect wallet A and close the claim to verify the remaining escrow refund.

Do not resubmit a transaction merely because Studionet indexing is slow. The UI keeps the transaction hash, polls the expected state for up to two minutes and exposes Sync for later refresh.

## Verified Studionet Lifecycle

The full payable lifecycle was executed against the configured deployment on July 19, 2026. Claim `#0` locked `10 wei`, evidence `#0` reached an `APPROVED` verdict with a `10 wei` payout, and settlement transferred the native balance to the recorded contributor.

| Step | Transaction |
|------|-------------|
| Create funded claim | `0x5cb7a9f7bc370b072c481e5652252b8a8337c031b6154201e6ea2c3716e5cb98` |
| Submit independent sources | `0x06e26e6a65bf2c3e7acc64cb82c6c9a94452db484737a5bcf38d8b0ba0677882` |
| AI source jury | `0x062f7f30f3d7fc5bc8c2f4d7e376c9249ef02ad3913fe48824653c4092825a2a` |
| Settle reward | `0x88e5bacd58b45a887912e388d2d49dfe71f0752dd52ae62008ca6a7109385e05` |
| Triggered native transfer | `0xd7ca1884e231288afc2e328b83107edef359372ba38f57ddd5ea0d9efaeccd83` |

Final on-chain checks: claim status `SETTLED`, evidence status `PAID`, contract balance `0 wei`, contributor balance increase `10 wei`, and platform `total_paid` equal to `10 wei`. The machine-readable record is in [`deployments/studionet.json`](deployments/studionet.json).

The lifecycle can be repeated without storing a key in the repository:

```powershell
cd frontend
$env:CONTRACT_ADDRESS="0xfcfE88c93d284A00F19C7B1f7168c4A286325131"
$env:TEST_PRIVATE_KEY="<funded-test-wallet-private-key>"
$env:LIVE_WRITE="1"
npm run test:live
```

The script creates a fresh contributor account in memory, waits for Studionet `ACCEPTED`, verifies each state transition, waits for the triggered native transfer, and prints the public transaction hashes. Never commit the test key.
