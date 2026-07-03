import { createClient } from "genlayer-js";
import {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
} from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

type NetworkName =
  | "localnet"
  | "studionet"
  | "testnetAsimov"
  | "testnetBradbury";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

const network = (process.env.NEXT_PUBLIC_NETWORK as NetworkName) || "studionet";
const endpoint = process.env.NEXT_PUBLIC_GENLAYER_RPC;
const chainMap = {
  localnet,
  studionet,
  testnetAsimov,
  testnetBradbury,
};

const client = createClient({
  chain: chainMap[network] ?? testnetAsimov,
  ...(endpoint ? { endpoint } : {}),
});

type GenLayerRuntimeClient = {
  readContract: (args: {
    address: unknown;
    functionName: string;
    args: unknown[];
  }) => Promise<unknown>;
  writeContract: (args: {
    address: unknown;
    functionName: string;
    args: unknown[];
    value: bigint;
  }) => Promise<string>;
  waitForTransactionReceipt: (args: {
    hash: `0x${string}`;
    status: string;
  }) => Promise<{
    statusName?: string;
    txExecutionResultName?: string;
    txDataDecoded?: unknown;
  }>;
};

export type ContractResult = {
  success: boolean;
  data?: unknown;
  hash?: string;
  status?: string;
  error?: string;
};

function getContractAddress(contractAddress?: string) {
  return contractAddress || process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
}

export async function readContract(
  functionName: string,
  args: unknown[] = [],
  contractAddress?: string,
): Promise<ContractResult> {
  try {
    const address = getContractAddress(contractAddress);
    if (!address) {
      return { success: false, error: "Contract address is not configured" };
    }
    const runtimeClient = client as unknown as GenLayerRuntimeClient;
    const data = await runtimeClient.readContract({ address, functionName, args });
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Read failed",
    };
  }
}

export async function connectWallet(): Promise<ContractResult> {
  if (typeof window === "undefined" || !window.ethereum) {
    return { success: false, error: "Wallet provider not found" };
  }
  try {
    const accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
      params: [],
    })) as string[];
    return { success: true, data: accounts[0] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Wallet connection failed",
    };
  }
}

export async function writeContract(
  functionName: string,
  args: unknown[] = [],
  contractAddress?: string,
): Promise<ContractResult> {
  if (typeof window === "undefined") {
    return { success: false, error: "Contract writes are only available in the browser" };
  }

  try {
    const address = getContractAddress(contractAddress);
    if (!address) {
      return { success: false, error: "Contract address is not configured" };
    }
    if (!window.ethereum) {
      return { success: false, error: "Wallet provider not found" };
    }
    const accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
      params: [],
    })) as string[];
    const account = accounts[0];
    if (!account) {
      return { success: false, error: "No wallet account selected" };
    }

    const writeClient = createClient({
      chain: chainMap[network] ?? testnetAsimov,
      ...(endpoint ? { endpoint } : {}),
      provider: window.ethereum,
      account: account as `0x${string}`,
    });

    const runtimeClient = writeClient as unknown as GenLayerRuntimeClient;
    const hash = await runtimeClient.writeContract({
      address,
      functionName,
      args,
      value: BigInt(0),
    });

    const receipt = await runtimeClient.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      status: TransactionStatus.FINALIZED,
    });

    if (receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) {
      return {
        success: false,
        hash,
        status: receipt.statusName,
        error: "Contract execution failed",
      };
    }

    return {
      success: true,
      hash,
      status: receipt.statusName,
      data: receipt.txDataDecoded,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Write failed",
    };
  }
}
