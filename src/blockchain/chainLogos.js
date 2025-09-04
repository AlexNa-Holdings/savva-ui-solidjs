// src/blockchain/chainLogos.js
import { EthereumLogo, PulsechainTestnetLogo, PulsechainLogo } from '../x/ui/icons/ChainLogos.jsx';

export const CHAIN_LOGOS = {
  1: EthereumLogo, // Ethereum Mainnet
  943: PulsechainTestnetLogo, // PulseChain Testnet
  369: PulsechainLogo, // PulseChain Mainnet
};

export function getChainLogo(chainId) {
  return CHAIN_LOGOS[chainId] || null;
}