// tests/e2e/helpers/wallet-mock.js
//
// Injects a mock window.ethereum into the browser page.
// Signing and transactions are handled in Node.js via viem,
// bridged to the browser through Playwright's exposeFunction.

import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Sets up a mock wallet provider on the given Playwright page.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ privateKey: string, chainId: number, rpcUrl: string }} opts
 */
export async function setupWalletMock(page, { privateKey, chainId, rpcUrl }) {
  const account = privateKeyToAccount(privateKey);
  const chainIdHex = "0x" + chainId.toString(16);

  // Create a viem client for signing and sending real transactions
  const client = createWalletClient({
    account,
    chain: {
      id: chainId,
      name: "Test Chain",
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: http(rpcUrl),
  }).extend(publicActions);

  // --- Expose Node.js functions to the browser ---

  // Generic JSON-RPC proxy for read calls (eth_call, eth_getBalance, etc.)
  await page.exposeFunction("__e2e_rpc", async (method, paramsJson) => {
    const params = JSON.parse(paramsJson);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const json = await res.json();
    if (json.error) throw new Error(JSON.stringify(json.error));
    return JSON.stringify(json.result);
  });

  // Sign a message with the test private key
  await page.exposeFunction("__e2e_signMessage", async (message) => {
    const signature = await account.signMessage({ message });
    return signature;
  });

  // Sign and send a real transaction to the testnet
  await page.exposeFunction("__e2e_sendTransaction", async (txJson) => {
    const tx = JSON.parse(txJson);
    // Convert hex strings to BigInt where needed
    if (tx.value) tx.value = BigInt(tx.value);
    if (tx.gas) tx.gas = BigInt(tx.gas);
    if (tx.gasPrice) tx.gasPrice = BigInt(tx.gasPrice);
    if (tx.maxFeePerGas) tx.maxFeePerGas = BigInt(tx.maxFeePerGas);
    if (tx.maxPriorityFeePerGas) tx.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
    if (tx.nonce != null) tx.nonce = Number(tx.nonce);

    const hash = await client.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value || 0n,
      gas: tx.gas,
      gasPrice: tx.gasPrice,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    });
    return hash;
  });

  // --- Inject window.ethereum mock into the browser ---

  await page.addInitScript(
    ({ address, chainIdHex }) => {
      const listeners = {};
      // Persist connected state across page reloads via sessionStorage
      let _connected = (() => {
        try { return sessionStorage.getItem("__e2e_wallet_connected") === "1"; } catch { return false; }
      })();

      window.ethereum = {
        isMetaMask: true,
        isConnected: () => true,
        selectedAddress: _connected ? address : null,

        async request({ method, params }) {
          // console.log("[mock-ethereum]", method, params);

          switch (method) {
            case "eth_requestAccounts":
              // User explicitly connecting — unlock the address
              _connected = true;
              try { sessionStorage.setItem("__e2e_wallet_connected", "1"); } catch {}
              window.ethereum.selectedAddress = address;
              if (listeners.accountsChanged) {
                setTimeout(() => {
                  listeners.accountsChanged.forEach((fn) => fn([address]));
                }, 0);
              }
              return [address];

            case "eth_accounts":
              // Only return address if user has already connected
              return _connected ? [address] : [];

            case "eth_chainId":
              return chainIdHex;

            case "net_version":
              return String(parseInt(chainIdHex, 16));

            case "personal_sign": {
              // params[0] = hex-encoded message, params[1] = account
              const hexMsg = params[0];
              // Decode hex to UTF-8 string
              let message;
              try {
                const bytes = [];
                const hex = hexMsg.startsWith("0x") ? hexMsg.slice(2) : hexMsg;
                for (let i = 0; i < hex.length; i += 2) {
                  bytes.push(parseInt(hex.substring(i, i + 2), 16));
                }
                message = new TextDecoder().decode(new Uint8Array(bytes));
              } catch {
                message = hexMsg;
              }
              return await window.__e2e_signMessage(message);
            }

            case "eth_sendTransaction": {
              const tx = params[0];
              return await window.__e2e_sendTransaction(JSON.stringify(tx));
            }

            case "wallet_switchEthereumChain":
            case "wallet_addEthereumChain":
              return null; // success

            case "eth_getTransactionReceipt":
            case "eth_call":
            case "eth_estimateGas":
            case "eth_gasPrice":
            case "eth_getBalance":
            case "eth_getCode":
            case "eth_getTransactionCount":
            case "eth_blockNumber":
            case "eth_getBlockByNumber":
            case "eth_getBlockByHash":
            case "eth_getLogs":
            case "eth_maxPriorityFeePerGas":
            case "eth_feeHistory": {
              const resultJson = await window.__e2e_rpc(
                method,
                JSON.stringify(params || [])
              );
              return JSON.parse(resultJson);
            }

            default:
              console.warn("[mock-ethereum] unhandled method:", method);
              throw new Error(`Mock ethereum: unhandled method ${method}`);
          }
        },

        on(event, fn) {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(fn);
        },

        removeListener(event, fn) {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((f) => f !== fn);
          }
        },

        removeAllListeners(event) {
          if (event) delete listeners[event];
          else Object.keys(listeners).forEach((k) => delete listeners[k]);
        },
      };
    },
    { address: account.address, chainIdHex }
  );
}
