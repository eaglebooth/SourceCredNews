# SourceCred News

AI-reviewed news source verification rewards on GenLayer.

One-line pitch: SourceCred News dies without GenLayer because its core product is an on-chain judgment about whether public web sources support, contradict, or weaken a news claim before source contributors are rewarded.

## Submission Links

- Live app: https://sourcecred-news.vercel.app
- GitHub repo: https://github.com/eaglebooth/SourceCredNews
- GenLayer Studio contract: `0x7cC77825157bEEA82bc75bCC8121f7645b0Dba43`

## Why GenLayer

Fact-checking is not only keyword matching. A useful verification flow must read multiple sources, understand whether they actually support a claim, detect contradictions, and reward contributors who bring high-quality evidence.

SourceCred News puts that adjudication into a GenLayer Intelligent Contract:

- A user creates a verification bounty for a public claim.
- A contributor submits primary and secondary source URLs.
- The contract reads source pages through `gl.nondet.web.get`.
- An AI prompt scores source reliability, relevance, corroboration, contradiction detection, and evidence quality.
- `gl.eq_principle.strict_eq` wraps the nondeterministic review.
- The contract stores a claim verdict: `SUPPORTED`, `CONTRADICTED`, `UNCLEAR`, or `MISLEADING`.
- Source contributors can receive full or partial rewards only after approved evidence quality.

## Project Structure

```text
SourceCredNews/
  contracts/SourceCredNews.py
  frontend/
  tests/test_contract_static.py
  scripts/deploy/deploy.ps1
  docs/design-guidelines/meeko-extracted-design.md
```

## Builder Program Score Path

| Axis | Target | Evidence |
|---|---:|---|
| GenLayer fit | 5 | Core truth verdict depends on reading web sources and subjective AI reasoning. |
| Contract quality | 4-5 | Multi-source review, semantic verdicts, reward guards, explicit errors, deterministic JSON views. |
| Engineering | 4 | Separate contract, frontend, tests, deploy script, README, design documentation. |
| Frontend / UX | 4 | Full claim creation, source submission, verification, and reward release flow. |

## Pre-Deploy Verification

```powershell
python -m unittest discover -s tests
python -c "import ast; ast.parse(open('contracts/SourceCredNews.py', encoding='utf-8').read())"
genlayer lint contracts/SourceCredNews.py
```

## Deploy Contract

```powershell
genlayer deploy contracts/SourceCredNews.py --name SourceCredNews
```

After deploy, set:

```text
NEXT_PUBLIC_CONTRACT_ADDRESS=<deployed address>
NEXT_PUBLIC_NETWORK=testnetAsimov
NEXT_PUBLIC_GENLAYER_RPC=
```

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend is in English and follows a Meeko-inspired pastel editorial style: lavender canvas, outlined portfolio cards, sticker labels, playful case-study composition, and pill-shaped verification stats.
