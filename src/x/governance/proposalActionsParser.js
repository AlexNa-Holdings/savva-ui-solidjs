// src/x/governance/proposalActionsParser.js
import { decodeFunctionData, toHex } from "viem";
import ConfigAbi from "../../blockchain/abi/Config.json";

/**
 * Configuration parameter metadata
 * Defines how each parameter should be displayed and formatted
 */
export const CONFIG_PARAMS = {
  // Uint parameters
  authorShare: {
    type: "uint",
    label: "Author Share",
    format: "percent100", // percents * 100
    description: "The author's share of the content fund",
  },
  nftOwnerCut: {
    type: "uint",
    label: "NFT Owner Cut",
    format: "percent100",
    description: "The NFT owner's cut",
  },
  minContribution: {
    type: "uint",
    label: "Minimum Contribution",
    format: "token",
    tokenSymbol: "SAVVA",
    description: "The minimum contribution to the content fund",
  },
  timeForRound: {
    type: "uint",
    label: "Time for Round",
    format: "duration",
    description: "The duration of a content fund round",
  },
  winnerShare: {
    type: "uint",
    label: "Winner Share",
    format: "percent",
    description: "The round prize's share of the fund",
  },
  minFundToShare: {
    type: "uint",
    label: "Minimum Fund to Share",
    format: "token",
    tokenSymbol: "SAVVA",
    description: "The minimum fund amount required to share prizes",
  },
  staking_withdraw_delay: {
    type: "uint",
    label: "Staking Withdraw Delay",
    format: "duration",
    description: "The staking cooldown period",
  },
  contentNFT_mintPrice: {
    type: "uint",
    label: "Content NFT Mint Price",
    format: "token",
    tokenSymbol: "PLS",
    description: "The price to mint a content NFT",
  },
  pulsex_slippage: {
    type: "uint",
    label: "PulseX Slippage",
    format: "percent",
    description: "The slippage tolerance for PulseX swaps",
  },
  min_staked_to_post: {
    type: "uint",
    label: "Minimum Staked to Post",
    format: "token",
    tokenSymbol: "SAVVA",
    description: "The minimum staked SAVVA required to post content",
  },
  sac_min_deposit: {
    type: "uint",
    label: "Sacrifice Minimum Deposit",
    format: "token",
    tokenSymbol: "PLS",
    description: "The minimum deposit for the sacrifice phase",
  },
  patron_payment_period: {
    type: "uint",
    label: "Patron Payment Period",
    format: "duration",
    description: "The duration of a patron payment period",
  },
  gov_proposal_price: {
    type: "uint",
    label: "Governance Proposal Price",
    format: "token",
    tokenSymbol: "PLS",
    description: "The price to create a new governance proposal",
  },
  nft_auction_max_duration: {
    type: "uint",
    label: "NFT Auction Max Duration",
    format: "duration",
    description: "The maximum duration for an NFT auction",
  },
  nft_auction_min_increment: {
    type: "uint",
    label: "NFT Auction Min Increment",
    format: "percent",
    description: "The minimum bid increment for an NFT auction",
  },
  nft_auction_max_increment: {
    type: "uint",
    label: "NFT Auction Max Increment",
    format: "percent",
    description: "The maximum bid increment for an NFT auction",
  },
  min_staked_for_nft_auction: {
    type: "uint",
    label: "Minimum Staked for NFT Auction",
    format: "token",
    tokenSymbol: "SAVVA",
    description: "The minimum staked SAVVA required to create an NFT auction",
  },
  min_staked_for_fundrasing: {
    type: "uint",
    label: "Minimum Staked for Fundraising",
    format: "token",
    tokenSymbol: "SAVVA",
    description: "The minimum staked SAVVA required to create a fundraiser",
  },
  fundraising_bb_fee: {
    type: "uint",
    label: "Fundraising Buyback Fee",
    format: "percent100",
    description: "The buyback fee for fundraisers",
  },

  // Address parameters
  authorsClubsGainReceiver: {
    type: "address",
    label: "Authors Clubs Gain Receiver",
    format: "address",
    description: "The address that receives staking gains from Authors Clubs",
  },
  contract_savvaToken: {
    type: "address",
    label: "SAVVA Token Contract",
    format: "address",
    description: "SAVVA token contract address",
  },
  contract_randomOracle: {
    type: "address",
    label: "Random Oracle Contract",
    format: "address",
    description: "Random oracle contract address",
  },
  contract_staking: {
    type: "address",
    label: "Staking Contract",
    format: "address",
    description: "Staking contract address",
  },
  contract_userProfile: {
    type: "address",
    label: "User Profile Contract",
    format: "address",
    description: "User Profile contract address",
  },
  contract_contentNFT: {
    type: "address",
    label: "Content NFT Contract",
    format: "address",
    description: "Content NFT contract address",
  },
  contract_contentFund: {
    type: "address",
    label: "Content Fund Contract",
    format: "address",
    description: "Content Fund contract address",
  },
  contract_governance: {
    type: "address",
    label: "Governance Contract",
    format: "address",
    description: "Governance contract address",
  },
  contract_contentRegistry: {
    type: "address",
    label: "Content Registry Contract",
    format: "address",
    description: "Content Registry contract address",
  },
  contract_savvaFaucet: {
    type: "address",
    label: "SAVVA Faucet Contract",
    format: "address",
    description: "SAVVA Faucet contract address",
  },
  contract_nftMarketplace: {
    type: "address",
    label: "NFT Marketplace Contract",
    format: "address",
    description: "NFT Marketplace contract address",
  },
  contract_promo: {
    type: "address",
    label: "Promo Contract",
    format: "address",
    description: "Promo contract address",
  },
  contract_buyBurn: {
    type: "address",
    label: "Buy & Burn Contract",
    format: "address",
    description: "Buy & Burn contract address",
  },
  contract_listMarket: {
    type: "address",
    label: "List Market Contract",
    format: "address",
    description: "List Market contract address",
  },
  contract_authorOfTheMonth: {
    type: "address",
    label: "Author of the Month Contract",
    format: "address",
    description: "Author of the Month contract address",
  },
  pulsex_factory: {
    type: "address",
    label: "PulseX Factory",
    format: "address",
    description: "PulseX factory contract for Buy & Burn",
  },
  pulsex_router: {
    type: "address",
    label: "PulseX Router",
    format: "address",
    description: "PulseX router contract for Buy & Burn",
  },
  WPLS: {
    type: "address",
    label: "Wrapped PLS (WPLS)",
    format: "address",
    description: "Wrapped PLS contract address",
  },
};

/**
 * Convert bytes32 to string parameter name
 * @param {string} bytes32Key - The bytes32 key
 * @returns {string|null} The parameter name or null if unknown
 */
function bytes32ToParamName(bytes32Key) {
  if (!bytes32Key) return null;

  // Try to find matching parameter by converting name to bytes32
  for (const [paramName, _] of Object.entries(CONFIG_PARAMS)) {
    // Convert parameter name to bytes32 for comparison
    // This is a simplified version - you may need to adjust based on actual encoding
    const paramBytes32 = toHex(paramName, { size: 32 });
    if (paramBytes32.toLowerCase() === bytes32Key.toLowerCase()) {
      return paramName;
    }
  }

  // Try to decode as UTF-8 string
  try {
    const hexStr = bytes32Key.startsWith("0x") ? bytes32Key.slice(2) : bytes32Key;
    const decoded = Buffer.from(hexStr, "hex")
      .toString("utf8")
      .replace(/\0/g, ""); // Remove null bytes
    if (decoded && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(decoded)) {
      return decoded;
    }
  } catch (e) {
    // Ignore decode errors
  }

  return null;
}

/**
 * Parse a single proposal action (contract call)
 * @param {Object} action - The action object with target, value, calldata
 * @param {string} configContractAddress - The Config contract address
 * @param {Object} configContract - Optional Config contract instance for fetching current values
 * @returns {Object} Parsed action details
 */
export function parseProposalAction(action, configContractAddress, configContract = null) {
  const { target, value, calldata } = action;

  // Check if this is a call to the Config contract
  const isConfigCall =
    target?.toLowerCase() === configContractAddress?.toLowerCase();

  if (!isConfigCall) {
    // Non-Config contract call - return warning details
    return {
      type: "unknown",
      warning: true,
      target,
      value: value || "0",
      calldata,
      display: {
        title: "⚠️ Non-Config Contract Call",
        subtitle: `Contract: ${target?.slice(0, 6)}...${target?.slice(-4)}`,
        details: [
          { label: "Target Address", value: target, format: "address" },
          { label: "ETH Value", value: value || "0", format: "token", tokenSymbol: "PLS" },
          { label: "Calldata", value: calldata, format: "hex" },
        ],
      },
    };
  }

  // Try to decode the function call
  try {
    const decoded = decodeFunctionData({
      abi: ConfigAbi,
      data: calldata,
    });

    const functionName = decoded.functionName;
    const args = decoded.args;

    // Handle different Config setter functions
    if (functionName === "setUInt") {
      const [keyBytes32, newValue] = args;
      const paramName = bytes32ToParamName(keyBytes32);
      const paramMeta = paramName ? CONFIG_PARAMS[paramName] : null;

      return {
        type: "config_uint",
        paramName: paramName || "unknown",
        paramMeta,
        keyBytes32,
        newValue,
        needsCurrentValue: true, // Flag to fetch current value
        display: {
          title: paramMeta?.label || paramName || "Unknown Parameter",
          subtitle: paramMeta?.description || "Update numeric configuration parameter",
          details: [
            {
              label: "Parameter",
              value: paramMeta?.label || paramName || keyBytes32,
              format: "text",
            },
          ],
        },
      };
    } else if (functionName === "setAddr") {
      const [keyBytes32, newAddress] = args;
      const paramName = bytes32ToParamName(keyBytes32);
      const paramMeta = paramName ? CONFIG_PARAMS[paramName] : null;

      return {
        type: "config_address",
        paramName: paramName || "unknown",
        paramMeta,
        keyBytes32,
        newValue: newAddress,
        needsCurrentValue: true, // Flag to fetch current value
        display: {
          title: paramMeta?.label || paramName || "Unknown Address Parameter",
          subtitle: paramMeta?.description || "Update address configuration parameter",
          details: [
            {
              label: "Parameter",
              value: paramMeta?.label || paramName || keyBytes32,
              format: "text",
            },
          ],
        },
      };
    } else if (functionName === "set") {
      const [keyBytes32, newString] = args;
      const paramName = bytes32ToParamName(keyBytes32);
      const paramMeta = paramName ? CONFIG_PARAMS[paramName] : null;

      return {
        type: "config_string",
        paramName: paramName || "unknown",
        paramMeta,
        keyBytes32,
        newValue: newString,
        needsCurrentValue: true, // Flag to fetch current value
        display: {
          title: paramMeta?.label || paramName || "Unknown String Parameter",
          subtitle: paramMeta?.description || "Update string configuration parameter",
          details: [
            {
              label: "Parameter",
              value: paramMeta?.label || paramName || keyBytes32,
              format: "text",
            },
          ],
        },
      };
    } else {
      // Other Config contract functions
      return {
        type: "config_other",
        warning: true,
        functionName,
        args,
        display: {
          title: `⚠️ Config Contract: ${functionName}`,
          subtitle: "Unrecognized Config function call",
          details: [
            { label: "Function", value: functionName, format: "text" },
            { label: "Arguments", value: JSON.stringify(args), format: "text" },
          ],
        },
      };
    }
  } catch (error) {
    console.error("Failed to decode proposal action:", error);
    return {
      type: "decode_error",
      warning: true,
      error: error.message,
      target,
      value,
      calldata,
      display: {
        title: "⚠️ Failed to Decode Action",
        subtitle: "Could not parse the contract call",
        details: [
          { label: "Target", value: target, format: "address" },
          { label: "Calldata", value: calldata, format: "hex" },
          { label: "Error", value: error.message, format: "text" },
        ],
      },
    };
  }
}

/**
 * Parse all actions in a proposal
 * @param {Array} actions - Array of action objects
 * @param {string} configContractAddress - The Config contract address
 * @returns {Array} Array of parsed actions
 */
export function parseProposalActions(actions, configContractAddress) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return [];
  }

  return actions.map((action) =>
    parseProposalAction(action, configContractAddress)
  );
}
