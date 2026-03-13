// src/blockchain/swap.js
import { createPublicClient, getContract } from "viem";
import { getSavvaContract, configuredHttp } from "./contracts.js";
import { dbg } from "../utils/debug.js";

// Minimal ERC-20 ABI for approve + allowance
const ERC20_APPROVE_ABI = [
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "spender" }, { type: "uint256", name: "amount" }],
    outputs: [{ type: "bool" }] },
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ type: "address", name: "owner" }, { type: "address", name: "spender" }],
    outputs: [{ type: "uint256" }] },
];

function _publicClient(app) {
  const chain = app.desiredChain();
  return createPublicClient({ chain, transport: configuredHttp(chain.rpcUrls[0]) });
}

/**
 * Get a quote for a swap using the contract's getAmountOut view function.
 * Tries direct pair and WETH route, returns the best price.
 * Returns the expected amountOut as bigint.
 */
export async function getSwapQuote(app, { fromAddress, toAddress, amountIn }) {
  const pc = _publicClient(app);
  const swapContract = await getSavvaContract(app, "SavvaSwap");

  // For native token, use address(0)
  const from = (!fromAddress || fromAddress === "0") ? "0x0000000000000000000000000000000000000000" : fromAddress;
  const to = (!toAddress || toAddress === "0") ? "0x0000000000000000000000000000000000000000" : toAddress;

  const amountOut = await pc.readContract({
    address: swapContract.address,
    abi: swapContract.abi,
    functionName: "getAmountOut",
    args: [from, amountIn, to],
  });

  dbg.log("Swap", "Quote:", { from, to, amountIn: amountIn.toString(), amountOut: amountOut.toString() });
  return amountOut;
}

/**
 * Execute the swap via SavvSwap contract.
 * Handles ERC-20 approval if needed.
 * Returns the transaction receipt.
 */
export async function executeSwap(app, { fromAddress, toAddress, amountIn, amountOutMin = 0n, onStatus }) {
  const isFromNative = !fromAddress || fromAddress === "0";
  const isToNative = !toAddress || toAddress === "0";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const walletClient = await app.getGuardedWalletClient();
  const pc = _publicClient(app);
  const userAddress = walletClient.account.address;

  // For ERC-20 → need approval to SavvSwap contract
  if (!isFromNative) {
    onStatus?.("approving");
    const swapRead = await getSavvaContract(app, "SavvaSwap");
    const tokenContract = getContract({ address: fromAddress, abi: ERC20_APPROVE_ABI, client: walletClient });
    const tokenRead = getContract({ address: fromAddress, abi: ERC20_APPROVE_ABI, client: pc });

    const allowance = await tokenRead.read.allowance([userAddress, swapRead.address]);
    if (allowance < amountIn) {
      const MAX = 2n ** 256n - 1n;
      const approveHash = await tokenContract.write.approve([swapRead.address, MAX]);
      const approveReceipt = await pc.waitForTransactionReceipt({ hash: approveHash });
      if (approveReceipt.status !== "success") {
        throw new Error("Token approval failed");
      }
    }
  }

  // Execute swap
  onStatus?.("swapping");
  const swapWrite = await getSavvaContract(app, "SavvaSwap", { write: true });

  let hash;
  if (isFromNative) {
    hash = await swapWrite.write.swapExactNative([isToNative ? ZERO_ADDR : toAddress, userAddress, amountOutMin], { value: amountIn });
  } else {
    hash = await swapWrite.write.swapExact([fromAddress, amountIn, isToNative ? ZERO_ADDR : toAddress, userAddress, amountOutMin]);
  }

  dbg.log("Swap", "Transaction hash:", hash);
  onStatus?.("confirming");

  const receipt = await pc.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("Swap transaction failed");
  }

  return receipt;
}
