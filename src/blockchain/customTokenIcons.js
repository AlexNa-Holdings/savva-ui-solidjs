// src/blockchain/customTokenIcons.js
import { DaiIcon, UsdcIcon, Usdt0Icon } from "../x/ui/icons/TokenIcons.jsx";

// Keys MUST be lowercase addresses.
export const CUSTOM_ICON_MAP = {
  // PulseChain
  '0xefd766ccb38eaf1dfd701853bfce31359239f305': DaiIcon,
  '0x15d38573d2feeb82e7ad5187ab8c1d52810b1f07': UsdcIcon,
  // Monad
  '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': Usdt0Icon,  // USDT0
  '0x754704bc059f8c67012fed69bc8a327a5aafb603': UsdcIcon,   // USDC
};
