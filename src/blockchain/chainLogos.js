// src/blockchain/chainLogos.js
import { EthereumLogo, PulsechainTestnetLogo, PulsechainLogo, MonadLogo, MonadTestnetLogo } from '../x/ui/icons/ChainLogos.jsx';

export const CHAIN_LOGOS = {
  1: EthereumLogo, // Ethereum Mainnet
  943: PulsechainTestnetLogo, // PulseChain Testnet
  369: PulsechainLogo, // PulseChain Mainnet
  143: MonadLogo, // Monad Mainnet
  10143: MonadTestnetLogo, // Monad Testnet
};

export function getChainLogo(chainId) {
  return CHAIN_LOGOS[chainId] || null;
}