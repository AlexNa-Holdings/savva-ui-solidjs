// src/blockchain/npoMulticall.js
import { createPublicClient, http, getContract, encodeFunctionData } from "viem";
import SavvaNPOAbi from "./abi/SavvaNPO.json";
import { getSavvaContract } from "./contracts.js";
import { pushToast, pushErrorToast } from "../ui/toast.js";

const toBigInt = (v) => (typeof v === "bigint" ? v : v == null || v === "" ? 0n : BigInt(v));

function requireActor(app) {
  const isNpo = app.actorIsNpo?.();
  const address = app.actorAddress?.();
  if (!address) throw new Error("Actor address is not available");
  return { isNpo: !!isNpo, address };
}

async function getClients(app) {
  const walletClient = await app.getGuardedWalletClient?.();
  if (!walletClient) throw new Error("Wallet client not available");
  const chain = app.desiredChain?.();
  const rpc =
    chain?.rpcUrls?.default?.http?.[0] ||
    chain?.rpcUrls?.public?.http?.[0] ||
    app.info?.()?.rpc_url;
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  return { walletClient, publicClient };
}

export function buildCall({ target, abi, functionName, args = [], valueWei = 0n }) {
  if (!target) throw new Error("target is required");
  const data = encodeFunctionData({ abi, functionName, args });
  return { target, data, value: toBigInt(valueWei) };
}

export async function buildCallByContractName(app, contractName, functionName, args = [], valueWei = 0n) {
  const reg = await getSavvaContract(app, contractName);
  const abi = (await import(`./abi/${contractName}.json`)).default;
  return buildCall({ target: reg.address, abi, functionName, args, valueWei });
}

export function erc20ApproveCall(tokenAddress, spender, amount) {
  const ERC20_APPROVE_ABI = [
    { name: "approve", type: "function", stateMutability: "nonpayable",
      inputs: [{ type: "address", name: "spender" }, { type: "uint256", name: "amount" }],
      outputs: [{ type: "bool" }] },
  ];
  return buildCall({
    target: tokenAddress,
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [spender, amount],
  });
}

// Always send directly (user/self)
export async function sendAsUser(app, spec) {
  const { functionName, args = [], valueWei = 0n } = spec || {};
  if (!functionName) throw new Error("functionName is required");
  const { t } = app;
  const toastId = pushToast({ type: "info", message: t("tx.pending"), autohideMs: 0 });

  try {
    const { walletClient, publicClient } = await getClients(app);

    if (spec.contractName) {
      const c = await getSavvaContract(app, spec.contractName, { write: true });
      const hash = await c.write[functionName]([...args], { value: toBigInt(valueWei) });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`Transaction failed with status: ${receipt.status}`);
      pushToast({ type: "success", message: t("tx.success") });
      return receipt;
    }

    if (!spec.target || !spec.abi) throw new Error("Provide contractName OR (target + abi)");
    const c = getContract({ address: spec.target, abi: spec.abi, client: walletClient });
    const hash = await c.write[functionName]([...args], { value: toBigInt(valueWei) });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Transaction failed with status: ${receipt.status}`);
    pushToast({ type: "success", message: t("tx.success") });
    return receipt;
  } catch (e) {
    pushErrorToast(e, { context: t("tx.error") });
    throw e;
  } finally {
    try { app.dismissToast?.(toastId); } catch {}
  }
}

// Auto-detect actor from useActor (NPO => multicall, self => direct)
export async function sendAsActor(app, spec) {
  const { isNpo } = requireActor(app);
  return isNpo ? sendViaNpoMulticall(app, spec) : sendAsUser(app, spec);
}

async function sendViaNpoMulticall(app, spec) {
  const { functionName, args = [], valueWei = 0n } = spec || {};
  if (!functionName) throw new Error("functionName is required");

  const { t } = app;
  const toastId = pushToast({ type: "info", message: t("npo.multicall.pending"), autohideMs: 0 });

  try {
    const { address: npoAddr } = requireActor(app);
    const { walletClient, publicClient } = await getClients(app);

    const call =
      spec.contractName
        ? await buildCallByContractName(app, spec.contractName, functionName, args, valueWei)
        : buildCall({ target: spec.target, abi: spec.abi, functionName, args, valueWei });

    const npo = getContract({ address: npoAddr, abi: SavvaNPOAbi, client: walletClient });
    // Pass an array of Call structs (object form to avoid field-order mistakes)
    const calls = [{ target: call.target, data: call.data, value: call.value }];
    const hash = await npo.write.multicall([calls]);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Transaction failed with status: ${receipt.status}`);

    pushToast({ type: "success", message: t("npo.multicall.success") });
    return receipt;
  } catch (e) {
    pushErrorToast(e, { context: t("npo.multicall.error") });
    throw e;
  } finally {
    try { app.dismissToast?.(toastId); } catch {}
  }
}
