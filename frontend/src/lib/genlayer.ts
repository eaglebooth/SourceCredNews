import { createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

export type NetworkName = "localnet" | "studionet" | "testnetAsimov" | "testnetBradbury";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

const network = (process.env.NEXT_PUBLIC_NETWORK as NetworkName) || "studionet";
const endpoint = process.env.NEXT_PUBLIC_GENLAYER_RPC;
const chainMap = { localnet, studionet, testnetAsimov, testnetBradbury };
const readClient = createClient({
  chain: chainMap[network] ?? studionet,
  ...(endpoint ? { endpoint } : {}),
});

type ReceiptLike = {
  statusName?: string;
  txExecutionResultName?: string;
  txDataDecoded?: unknown;
  consensus_data?: {
    validators?: Array<{ genvm_result?: { execution_result?: string; stderr?: string } }>;
  };
};

type RuntimeClient = {
  connect?: (networkName: NetworkName) => Promise<unknown>;
  readContract: (args: { address: unknown; functionName: string; args: unknown[] }) => Promise<unknown>;
  writeContract: (args: { address: unknown; functionName: string; args: unknown[]; value: bigint }) => Promise<string>;
  waitForTransactionReceipt: (args: {
    hash: `0x${string}`;
    status: string;
    interval?: number;
    retries?: number;
  }) => Promise<ReceiptLike>;
  getTransaction: (args: { hash: `0x${string}` }) => Promise<ReceiptLike>;
};

export type ContractResult = {
  success: boolean;
  pending?: boolean;
  data?: unknown;
  hash?: string;
  status?: string;
  error?: string;
};

export const configuredNetwork = network;

export function defaultContractAddress() {
  return process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
}

function validAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function receiptFailure(receipt: ReceiptLike) {
  const executions = receipt.consensus_data?.validators
    ?.map((validator) => validator.genvm_result)
    .filter((execution) => Boolean(execution?.execution_result)) || [];
  if (executions.length && executions.every((execution) => execution?.execution_result === "ERROR")) {
    const stderr = executions.find((execution) => execution?.stderr)?.stderr || "";
    return stderr.trim().split("\n").filter(Boolean).at(-1) || "GenVM execution failed.";
  }
  if (receipt.txExecutionResultName === "FINISHED_WITH_ERROR") return "Contract execution failed.";
  return "";
}

export async function readContract(
  address: string,
  functionName: string,
  args: unknown[] = [],
): Promise<ContractResult> {
  if (!validAddress(address)) return { success: false, error: "Enter a valid deployed contract address." };
  try {
    const data = await (readClient as unknown as RuntimeClient).readContract({ address, functionName, args });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Contract read failed." };
  }
}

export async function connectWallet(): Promise<ContractResult> {
  if (typeof window === "undefined" || !window.ethereum) {
    return { success: false, error: "Install or unlock a browser wallet to continue." };
  }
  try {
    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts", params: [] })) as string[];
    return accounts[0]
      ? { success: true, data: accounts[0] }
      : { success: false, error: "No wallet account selected." };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Wallet connection failed." };
  }
}

export async function writeContract(
  address: string,
  functionName: string,
  args: unknown[] = [],
  value: bigint = BigInt(0),
): Promise<ContractResult> {
  if (!validAddress(address)) return { success: false, error: "Enter a valid deployed contract address." };
  if (typeof window === "undefined" || !window.ethereum) {
    return { success: false, error: "A browser wallet is required for contract writes." };
  }

  let hash = "";
  let runtime: RuntimeClient | null = null;
  try {
    const accounts = (await window.ethereum.request({ method: "eth_requestAccounts", params: [] })) as string[];
    if (!accounts[0]) return { success: false, error: "No wallet account selected." };
    runtime = createClient({
      chain: chainMap[network] ?? studionet,
      ...(endpoint ? { endpoint } : {}),
      provider: window.ethereum,
      account: accounts[0] as `0x${string}`,
    }) as unknown as RuntimeClient;
    if (runtime.connect) await runtime.connect(network);

    hash = await runtime.writeContract({ address, functionName, args, value });
    const receipt = await runtime.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      status: TransactionStatus.ACCEPTED,
      interval: 2_000,
      retries: 120,
    });
    let observed = receipt;
    try {
      observed = await runtime.getTransaction({ hash: hash as `0x${string}` });
    } catch {
      // State verification in the UI remains authoritative when metadata lags.
    }
    const failure = receiptFailure(observed);
    if (failure) return { success: false, hash, status: observed.statusName, error: failure };
    return {
      success: true,
      hash,
      status: observed.statusName || receipt.statusName,
      data: observed.txDataDecoded ?? receipt.txDataDecoded,
    };
  } catch (error) {
    if (hash && runtime) {
      try {
        const transaction = await runtime.getTransaction({ hash: hash as `0x${string}` });
        const status = transaction.statusName || "PROCESSING";
        if (["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED"].includes(status)) {
          return {
            success: false,
            pending: true,
            hash,
            status,
            error: `Transaction is still ${status}. Do not resubmit; sync the existing state after consensus.`,
          };
        }
      } catch {
        // Return the original SDK error when monitoring is unavailable.
      }
    }
    return { success: false, hash: hash || undefined, error: error instanceof Error ? error.message : "Write failed." };
  }
}
