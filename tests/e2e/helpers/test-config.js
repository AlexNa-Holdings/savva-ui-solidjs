// tests/e2e/helpers/test-config.js
import dotenv from "dotenv";
import { privateKeyToAccount } from "viem/accounts";

dotenv.config();

function makeConfig(envKey) {
  const pk = process.env[envKey];
  if (!pk) return null;
  const account = privateKeyToAccount(pk);
  return {
    privateKey: pk,
    accountAddress: account.address,
    backendUrl: process.env.TEST_BACKEND || "https://monad-test.savva.app/api/",
    chainId: Number(process.env.TEST_CHAIN_ID || 10143),
    rpcUrl: "https://testnet-rpc.monad.xyz",
  };
}

export const testConfig = makeConfig("TEST_PRIVATE_KEY1");
if (!testConfig) throw new Error("TEST_PRIVATE_KEY1 not set in .env");

export const testConfig2 = makeConfig("TEST_PRIVATE_KEY2");
