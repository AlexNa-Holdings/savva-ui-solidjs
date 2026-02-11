// tests/e2e/helpers/staking-helper.js
//
// Programmatic staking helper — calls contracts directly from Node.js
// using viem. Used for test setup (ensuring account has enough stake).

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  getContract,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { testConfig } from "./test-config.js";

// Minimal ABIs — only the functions we need
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];

const STAKING_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "stake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
];

const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Fetch contract addresses from backend /info endpoint.
 * @param {object} config
 * @returns {Promise<{ SavvaToken: string, Staking: string }>}
 */
async function fetchContractAddresses(config) {
  const res = await fetch(config.backendUrl + "info", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`/info failed: ${res.status}`);
  const info = await res.json();
  const contracts = info.savva_contracts;
  if (!contracts?.SavvaToken?.address || !contracts?.Staking?.address) {
    throw new Error("SavvaToken or Staking address not found in /info");
  }
  return {
    SavvaToken: contracts.SavvaToken.address,
    Staking: contracts.Staking.address,
  };
}

/**
 * Create viem clients for a given config.
 * @param {object} config
 */
function createClients(config) {
  const account = privateKeyToAccount(config.privateKey);
  const chain = {
    id: config.chainId,
    name: "Test Chain",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  };
  const transport = http(config.rpcUrl);

  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });

  return { publicClient, walletClient, account };
}

/**
 * Get the current SAVVA token balance and staked balance.
 * @param {object} [config]
 * @returns {Promise<{ balance: bigint, staked: bigint, balanceFormatted: string, stakedFormatted: string }>}
 */
export async function getStakingInfo(config = testConfig) {
  const addresses = await fetchContractAddresses(config);
  const { publicClient, account } = createClients(config);

  const token = getContract({
    address: addresses.SavvaToken,
    abi: ERC20_ABI,
    client: publicClient,
  });
  const staking = getContract({
    address: addresses.Staking,
    abi: STAKING_ABI,
    client: publicClient,
  });

  const [balance, staked] = await Promise.all([
    token.read.balanceOf([account.address]),
    staking.read.balanceOf([account.address]),
  ]);

  return {
    balance,
    staked,
    balanceFormatted: formatUnits(balance, 18),
    stakedFormatted: formatUnits(staked, 18),
  };
}

/**
 * Ensure the test account has at least `minAmount` SAVVA staked.
 * If current stake is below the minimum, stakes additional tokens.
 *
 * @param {number|string} minAmount - Minimum stake in whole SAVVA tokens (e.g. 200)
 * @param {object} [config]
 * @returns {Promise<{ alreadyStaked: boolean, txHash?: string, staked: string, balance: string }>}
 */
export async function ensureStaked(minAmount = 200, config = testConfig) {
  const minWei = parseUnits(String(minAmount), 18);
  const addresses = await fetchContractAddresses(config);
  const { publicClient, walletClient, account } = createClients(config);

  const token = getContract({
    address: addresses.SavvaToken,
    abi: ERC20_ABI,
    client: publicClient,
  });
  const staking = getContract({
    address: addresses.Staking,
    abi: STAKING_ABI,
    client: publicClient,
  });

  const [balance, staked] = await Promise.all([
    token.read.balanceOf([account.address]),
    staking.read.balanceOf([account.address]),
  ]);

  console.log(
    `  Staking: balance=${formatUnits(balance, 18)} SAVVA, staked=${formatUnits(staked, 18)} SAVVA, required=${minAmount} SAVVA`
  );

  if (staked >= minWei) {
    return {
      alreadyStaked: true,
      staked: formatUnits(staked, 18),
      balance: formatUnits(balance, 18),
    };
  }

  // Need to stake more
  const deficit = minWei - staked;
  // Stake a bit extra (2x minimum) to avoid repeated top-ups
  const stakeAmount = deficit * 2n > balance ? balance : deficit * 2n;

  if (stakeAmount <= 0n || stakeAmount > balance) {
    throw new Error(
      `Insufficient SAVVA balance to stake. ` +
        `Need ${formatUnits(deficit, 18)} more, but only have ${formatUnits(balance, 18)} SAVVA. ` +
        `Account: ${account.address}`
    );
  }

  console.log(`  Staking ${formatUnits(stakeAmount, 18)} SAVVA tokens...`);

  // 1. Check & set allowance
  const allowance = await token.read.allowance([
    account.address,
    addresses.Staking,
  ]);

  if (allowance < stakeAmount) {
    console.log("  Approving Staking contract...");
    const approveTx = await walletClient.writeContract({
      address: addresses.SavvaToken,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [addresses.Staking, MAX_UINT256],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log(`  Approved: ${approveTx}`);
  }

  // 2. Stake
  const stakeTx = await walletClient.writeContract({
    address: addresses.Staking,
    abi: STAKING_ABI,
    functionName: "stake",
    args: [stakeAmount],
  });
  await publicClient.waitForTransactionReceipt({ hash: stakeTx });
  console.log(`  Staked: ${stakeTx}`);

  const newStaked = await staking.read.balanceOf([account.address]);

  return {
    alreadyStaked: false,
    txHash: stakeTx,
    staked: formatUnits(newStaked, 18),
    balance: formatUnits(balance - stakeAmount, 18),
  };
}
