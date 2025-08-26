// src/blockchain/config.js
import { getSavvaContract } from "./contracts.js";
import { toHexBytes32 } from "./utils.js";
import { dbg } from "../utils/debug.js";

// A cache to store config values once they are fetched.
const paramCache = new Map();

// A simple way to determine the type of a parameter based on its name.
function getParamType(name) {
  if (name.startsWith("contract_") || name.endsWith("Address") || name === 'pulsex_factory' || name === 'pulsex_router' || name === 'WPLS') {
    return 'address';
  }
  return 'uint';
}

/**
 * Fetches a configuration parameter from the Config smart contract.
 * Results are cached to avoid repeated blockchain calls.
 *
 * @param {object} app - The global application context from useApp().
 * @param {string} name - The human-readable name of the parameter (e.g., "min_staked_to_post").
 * @returns {Promise<string|number|bigint|null>} The value of the parameter.
 */
export async function getConfigParam(app, name) {
  if (paramCache.has(name)) {
    return paramCache.get(name);
  }

  try {
    const configContract = await getSavvaContract(app, 'Config');
    const keyHex = toHexBytes32(name);
    const paramType = getParamType(name);

    let value;
    if (paramType === 'address') {
      value = await configContract.read.getAddr([keyHex]);
    } else {
      value = await configContract.read.getUInt([keyHex]);
    }

    paramCache.set(name, value);
    return value;
  } catch (error) {
    dbg.error("ConfigHelper", `Failed to fetch config parameter '${name}'`, error);
    return null;
  }
}

/**
 * Clears the configuration parameter cache.
 * This should be called when the network or backend changes.
 */
export function clearConfigCache() {
    paramCache.clear();
    dbg.log("ConfigHelper", "Configuration cache cleared.");
}