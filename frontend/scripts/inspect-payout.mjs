import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const client = createClient({ chain: studionet });
const contract = process.env.CONTRACT_ADDRESS;
const recipient = process.env.RECIPIENT_ADDRESS;
const settlementHash = process.env.SETTLEMENT_HASH;

const transaction = await client.getTransaction({ hash: settlementHash });
const parse = (value) => typeof value === "string" ? JSON.parse(value) : value;
let triggered = [];
try { triggered = await client.getTriggeredTransactionIds({ hash: settlementHash }); } catch {}
const triggeredTransactions = [];
for (const hash of triggered) {
  try {
    const child = await client.getTransaction({ hash });
    triggeredTransactions.push({ hash, status: child.statusName, result: child.txExecutionResultName });
  } catch (error) {
    triggeredTransactions.push({ hash, error: error instanceof Error ? error.message : String(error) });
  }
}

const contractBalance = await client.getBalance({ address: contract });
const recipientBalance = await client.getBalance({ address: recipient });
const platform = parse(await client.readContract({ address: contract, functionName: "get_platform_state", args: [] }));
const claim = parse(await client.readContract({ address: contract, functionName: "get_claim", args: [0] }));
const evidence = parse(await client.readContract({ address: contract, functionName: "get_evidence", args: [0] }));
console.log(JSON.stringify({
  settlement: {
    hash: settlementHash,
    status: transaction.statusName,
    result: transaction.txExecutionResultName,
  },
  triggeredTransactions,
  contractBalance: contractBalance.toString(),
  recipientBalance: recipientBalance.toString(),
  platform,
  claim,
  evidence,
}, null, 2));
