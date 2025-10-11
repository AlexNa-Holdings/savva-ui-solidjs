// src/blockchain/transactions.js
import { pushToast, pushErrorToast } from "../ui/toast.js";
import { dbg } from "../utils/debug.js";
import { createPublicClient, getContract } from "viem";
import { getSavvaContract, configuredHttp } from "./contracts.js";

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
 * Manually splits a 65-byte signature into its r, s, and v components.
 * This avoids import issues with bundlers.
 * @param {`0x${string}`} signature The hex signature string.
 * @returns {{r: `0x${string}`, s: `0x${string}`, v: bigint}}
 */
function manualSplitSignature(signature) {
  const signatureBytes = signature.substring(2);
  const r = `0x${signatureBytes.substring(0, 64)}`;
  const s = `0x${signatureBytes.substring(64, 128)}`;
  const v = BigInt(`0x${signatureBytes.substring(128, 130)}`);
  return { r, s, v };
}

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
      transport: configuredHttp(app.desiredChain().rpcUrls[0]),
    });

    let hash;

    if (isNative) {
      hash = await walletClient.sendTransaction({ to: to, value: amountWei });
    } else {
      const tokenContract = getContract({ address: tokenAddress, abi: ERC20_TRANSFER_ABI, client: walletClient });
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
    throw error;
  }
}

/**
 * Stakes SAVVA tokens using the stakeWithPermit method.
 * @param {object} app - The app context from useApp().
 * @param {object} txData - The transaction data.
 * @param {bigint} txData.amountWei - The amount to stake in wei.
 */
export async function performStake(app, txData) {
  const { amountWei } = txData;
  const { t } = app;

  const toastId = pushToast({ type: "info", message: t("wallet.stake.toast.pending"), autohideMs: 0 });

  try {
    const walletClient = await app.getGuardedWalletClient();
    const publicClient = createPublicClient({
      chain: app.desiredChain(),
      transport: configuredHttp(app.desiredChain().rpcUrls[0]),
    });

    const userAddress = walletClient.account.address;

    // Contracts
    const savvaToken = await getSavvaContract(app, "SavvaToken", { write: true });
    const staking    = await getSavvaContract(app, "Staking", { write: true });

    // 1) Ensure sufficient allowance (approve MAX if needed)
    const spender = staking.address;
    const allowance = await savvaToken.read.allowance([userAddress, spender]);
    if (allowance < amountWei) {
      const approveToastId = "approve_toast";
      pushToast({
        type: "info",
        message: t("wallet.stake.toast.approving"),
        autohideMs: 0,
        id: approveToastId,
      });

      const MAX = 2n ** 256n - 1n; // unlimited approval
      const approveHash = await savvaToken.write.approve([spender, MAX]);

      try {
        const approveRcpt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
        if (approveRcpt.status !== "success") {
          throw new Error(`Approval failed: ${approveRcpt.status}`);
        }
      } finally {
        app.dismissToast?.(approveToastId);
      }
    }

    // 2) Stake (single confirmation if allowance was already enough)
    const stakeToastId = "stake_toast";
    pushToast({ type: "info", message: t("wallet.stake.toast.staking"), autohideMs: 0, id: stakeToastId });

    // assuming Staking has stake(uint256 amount). If your ABI uses a different name, adjust here.
    const hash = await staking.write.stake([amountWei]);

    // 3) Track confirmation (non-blocking for the UI)
    (async () => {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(`Transaction failed with status: ${receipt.status}`);
        pushToast({ type: "success", message: t("wallet.stake.toast.success") });
      } catch (error) {
        pushErrorToast(error, { context: t("wallet.stake.toast.error") });
      } finally {
        app.dismissToast?.(toastId);
        app.dismissToast?.(stakeToastId);
      }
    })();

    return { hash };
  } catch (error) {
    pushErrorToast(error, { context: t("wallet.stake.toast.error") });
    app.dismissToast?.(toastId);
    app.dismissToast?.("stake_toast");
    throw error;
  }
}