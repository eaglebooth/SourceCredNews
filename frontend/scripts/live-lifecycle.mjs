import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const contract = process.env.CONTRACT_ADDRESS;
const privateKeyValue = process.env.TEST_PRIVATE_KEY;
const privateKey = privateKeyValue?.startsWith("0x") ? privateKeyValue : `0x${privateKeyValue || ""}`;

if (!/^0x[a-fA-F0-9]{40}$/.test(contract || "")) throw new Error("CONTRACT_ADDRESS is required");
if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) throw new Error("TEST_PRIVATE_KEY is required");

const creator = createAccount(privateKey);
const contributor = createAccount();
const reader = createClient({ chain: studionet });
const creatorClient = createClient({ chain: studionet, account: creator });
const contributorClient = createClient({ chain: studionet, account: contributor });
const transactionHashes = [];

const parse = (value) => {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
};

const read = async (functionName, args = []) => parse(await reader.readContract({
  address: contract,
  functionName,
  args,
}));

const hashOf = (value) => typeof value === "string"
  ? value
  : value?.hash || value?.transaction_hash || value?.transactionHash;

const submit = async (client, label, functionName, args = [], value = 0n) => {
  const submitted = await client.writeContract({ address: contract, functionName, args, value });
  const hash = hashOf(submitted);
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash || "")) throw new Error(`${label}: missing transaction hash`);
  transactionHashes.push({ label, hash });
  console.log(`${label}: submitted ${hash}`);
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 2_000,
    retries: 300,
  });
  console.log(`${label}: ${receipt.statusName || "ACCEPTED"}`);
  return hash;
};

const waitFor = async (label, check, attempts = 60) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`${label}: accepted transaction did not produce the expected state`);
};

const initial = await read("get_platform_state");
const creatorBalanceBefore = await reader.getBalance({ address: creator.address });
const contributorBalanceBefore = await reader.getBalance({ address: contributor.address });

console.log(JSON.stringify({
  contract,
  creator: creator.address,
  contributor: contributor.address,
  creatorBalanceBefore: creatorBalanceBefore.toString(),
  contributorBalanceBefore: contributorBalanceBefore.toString(),
  initial,
}, null, 2));

if (process.env.LIVE_WRITE !== "1") process.exit(0);

const claimId = Number(initial.claim_count);
const escrow = 10n;
await submit(
  creatorClient,
  "create_claim",
  "create_claim",
  [
    "Verify GenLayer web and AI capabilities",
    "GenLayer Intelligent Contracts can use web information and large language models during contract execution.",
    "This claim verifies core GenLayer capabilities using official public sources.",
    60,
  ],
  escrow,
);

await waitFor("create_claim", async () => {
  const state = await read("get_platform_state");
  return Number(state.claim_count) === claimId + 1 ? state : null;
});
console.log("claim", await read("get_claim", [claimId]));

const evidenceId = Number((await read("get_platform_state")).evidence_count);
await submit(
  contributorClient,
  "submit_evidence",
  "submit_evidence",
  [
    claimId,
    "https://docs.genlayer.com/developers/intelligent-contracts/features/calling-llms",
    "https://genlayer.com/",
    "The official documentation describes LLM calls inside Intelligent Contracts, while the GenLayer site provides independent product context for AI-native on-chain execution.",
  ],
);

await waitFor("submit_evidence", async () => {
  const state = await read("get_platform_state");
  return Number(state.evidence_count) === evidenceId + 1 ? state : null;
});
console.log("evidence pending", await read("get_evidence", [evidenceId]));

await submit(contributorClient, "evaluate_evidence", "evaluate_evidence", [evidenceId]);
const reviewed = await waitFor("evaluate_evidence", async () => {
  const evidence = await read("get_evidence", [evidenceId]);
  return evidence.status !== "PENDING" ? evidence : null;
}, 120);
console.log("evidence reviewed", reviewed);

if (reviewed.status === "APPROVED" && BigInt(reviewed.payout) > 0n) {
  const settlementHash = await submit(contributorClient, "settle_reward", "settle_reward", [evidenceId]);
  await waitFor("settle_reward", async () => {
    const evidence = await read("get_evidence", [evidenceId]);
    return evidence.status === "PAID" ? evidence : null;
  });
  await waitFor("native payout", async () => {
    const balance = await reader.getBalance({ address: contributor.address });
    return balance > contributorBalanceBefore ? balance : null;
  }, 180);
  const triggered = await reader.getTriggeredTransactionIds({ hash: settlementHash });
  console.log("settlement transfers", triggered);
} else {
  await submit(creatorClient, "close_and_refund", "close_and_refund", [claimId]);
  await waitFor("close_and_refund", async () => {
    const claim = await read("get_claim", [claimId]);
    return claim.status === "CLOSED" ? claim : null;
  });
}

const finalState = await read("get_platform_state");
const finalClaim = await read("get_claim", [claimId]);
const finalEvidence = await read("get_evidence", [evidenceId]);
const creatorBalanceAfter = await reader.getBalance({ address: creator.address });
const contributorBalanceAfter = await reader.getBalance({ address: contributor.address });

console.log(JSON.stringify({
  finalState,
  finalClaim,
  finalEvidence,
  transactionHashes,
  creatorBalanceAfter: creatorBalanceAfter.toString(),
  contributorBalanceAfter: contributorBalanceAfter.toString(),
  contributorDelta: (contributorBalanceAfter - contributorBalanceBefore).toString(),
}, null, 2));
