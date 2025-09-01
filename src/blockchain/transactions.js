// src/blockchain/transactions.js
import { pushToast, pushErrorToast } from "../ui/toast.js";
import { dbg } from "../utils/debug.js";
import { createPublicClient, http, getContract } from "viem";

// Minimal ABI for ERC20 transfer
const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "to" }, { type: "uint256", name: "amount" }],
    outputs: [{ type: "bool" }],
  },
];

/**
 * Sends a transaction, handling both native and ERC20 token transfers.
 * @param {object} app - The app context from useApp().
 * @param {object} txData - The transaction data.
 * @param {string} txData.to - The recipient's address.
 * @param {bigint} txData.amountWei - The amount to send in wei.
 * @param {string} [txData.tokenAddress] - The ERC20 token address. If empty, it's a native transfer.
 */
export async function performTransfer(app, txData) {
  const { to, amountWei, tokenAddress } = txData;
  const { t } = app;

  const isNative = !tokenAddress || tokenAddress === "0";
  // The token symbol is resolved in the modal, but we need a fallback here for the toast.
  const tokenSymbol = isNative ? (app.desiredChain()?.nativeCurrency?.symbol || "coin") : "tokens";

  const toastId = pushToast({
    type: "info",
    message: t("wallet.transfer.toast.pending", { token: tokenSymbol }),
    autohideMs: 0,
  });

  try {
    const walletClient = await app.getGuardedWalletClient();
    const publicClient = createPublicClient({
      chain: app.desiredChain(),
      transport: http(app.desiredChain().rpcUrls[0]),
    });

    let hash;

    if (isNative) {
      hash = await walletClient.sendTransaction({
        to: to,
        value: amountWei,
      });
    } else {
      const tokenContract = getContract({
        address: tokenAddress,
        abi: ERC20_TRANSFER_ABI,
        client: walletClient,
      });
      hash = await tokenContract.write.transfer([to, amountWei]);
    }
    
    dbg.log("Transfer", `Transaction sent with hash: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== 'success') {
      throw new Error(`Transaction failed with status: ${receipt.status}`);
    }

    pushToast({ type: "success", message: t("wallet.transfer.toast.success") });
    app.dismissToast?.(toastId);
    return receipt;

  } catch (error) {
    pushErrorToast(error, { context: t("wallet.transfer.toast.error") });
    app.dismissToast?.(toastId);
    throw error; // Re-throw so the caller knows it failed.
  }
}