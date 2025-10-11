// src/blockchain/npoMulticall.js
import { createPublicClient, getContract, encodeFunctionData } from "viem";
import SavvaNPOAbi from "./abi/SavvaNPO.json";
import { getSavvaContract, configuredHttp } from "./contracts.js";
import { pushToast, pushErrorToast } from "../ui/toast.js";

const toBigInt = (v) => (typeof v === "bigint" ? v : v == null || v === "" ? 0n : BigInt(v));

function requireActor(app) {
  const isNpo = (app.isActingAsNpo?.() ?? app.actorProfile?.()?.is_npo ?? false) === true;
  const address = app.actorAddress?.() || app.authorizedUser?.()?.address || "";
  if (!address) throw new Error("Actor address is not available");
  return { isNpo, address };
}

// supports both shapes:
// - old: { rpcUrls: ["https://..."] }
// - viem: { rpcUrls: { default: { http: ["https://..."] }, public: { http: [...] } } }
function resolveRpcUrlFrom(chainLike) {
  if (!chainLike) return null;
  const u = chainLike.rpcUrls;
  if (!u) return null;
  if (Array.isArray(u)) return u[0] || null;          // old shape
  if (typeof u === "string") return u;                // very old / custom
  const d = u.default?.http?.[0];
  const p = u.public?.http?.[0];
  return d || p || null;                               // viem shape
}

function resolveRpcUrl(app, walletClient, chainFromApp) {
  return (
    resolveRpcUrlFrom(chainFromApp) ||
    resolveRpcUrlFrom(walletClient?.chain) ||
    app.info?.()?.rpc_url ||
    import.meta?.env?.VITE_RPC_URL ||
    null
  );
}

async function getClients(app) {
  const walletClient = await app.getGuardedWalletClient?.();
  if (!walletClient) throw new Error(app.t?.("tx.errorNoWallet") || "Wallet client not available");

  const chainFromApp = app.desiredChain?.() || null;
  const rpcUrl = resolveRpcUrl(app, walletClient, chainFromApp);
  if (!rpcUrl) {
    throw new Error(app.t?.("error.rpcNotConfigured") || "RPC URL is not configured for the current chain.");
  }

  // Match your older, working pattern: pass chain from app and explicit configuredHttp(rpcUrl)
  const publicClient = createPublicClient({
    chain: chainFromApp || walletClient.chain || undefined,
    transport: configuredHttp(rpcUrl),
  });

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
    {
      name: "approve",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [{ type: "address", name: "spender" }, { type: "uint256", name: "amount" }],
      outputs: [{ type: "bool" }],
    },
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
  const { functionName, args = [] } = spec || {};
  if (!functionName) throw new Error("functionName is required");

  // Accept both `value` and `valueWei` for compatibility
  const valueToSend = toBigInt(spec?.valueWei ?? spec?.value ?? 0n);

  const { t } = app;
  const toastId = pushToast({ type: "info", message: t("tx.pending"), autohideMs: 0 });

  try {
    const { walletClient, publicClient } = await getClients(app);

    if (spec.contractName) {
      const c = await getSavvaContract(app, spec.contractName, { write: true });
      const hash = await c.write[functionName]([...args], { value: valueToSend });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`Transaction failed with status: ${receipt.status}`);
      pushToast({ type: "success", message: t("tx.success") });
      return receipt;
    }

    if (!spec.target || !spec.abi) throw new Error("Provide contractName OR (target + abi)");
    const c = getContract({ address: spec.target, abi: spec.abi, client: walletClient });
    const hash = await c.write[functionName]([...args], { value: valueToSend });
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

// Auto-detect actor from AppContext actor API (NPO => multicall, self => direct)
export async function sendAsActor(app, spec) {
  const { isNpo } = requireActor(app);
  return isNpo ? sendViaNpoMulticall(app, spec) : sendAsUser(app, spec);
}

async function sendViaNpoMulticall(app, spec) {
  const { functionName, args = [] } = spec || {};
  if (!functionName) throw new Error("functionName is required");

  // Accept both `value` and `valueWei`, forward native value through the NPO
  const valueToSend = toBigInt(spec?.valueWei ?? spec?.value ?? 0n);

  const { t } = app;
  const toastId = pushToast({ type: "info", message: t("npo.multicall.pending"), autohideMs: 0 });

  try {
    const { address: npoAddr } = requireActor(app);
    const { walletClient, publicClient } = await getClients(app);

    const call =
      spec.contractName
        ? await buildCallByContractName(app, spec.contractName, functionName, args, valueToSend)
        : buildCall({ target: spec.target, abi: spec.abi, functionName, args, valueWei: valueToSend });

    const npo = getContract({ address: npoAddr, abi: SavvaNPOAbi, client: walletClient });

    // SavvaNPO.multicall((address target, bytes data, uint256 value)[] calls)
    const calls = [{ target: call.target, data: call.data, value: call.value }];

    // The NPO contract will use its own balance to pay for any value in the inner calls
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
