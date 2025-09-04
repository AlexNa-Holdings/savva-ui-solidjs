// src/x/profile/WalletValueMenu.jsx
import { createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { walletAccount } from "../../blockchain/wallet.js";
import ContextMenu from "../ui/ContextMenu.jsx";

/**
 * Lightweight “...” menu shown next to a wallet value.
 * Renders nothing unless:
 *  - viewer is authorized
 *  - viewer's address matches user.address
 *  - wallet is currently connected with the same address
 */
export default function WalletValueMenu(props) {
  const app = useApp();
  const { t } = app;

  const isOwnWallet = createMemo(() => {
    const u = props.user;
    const authed = app.authorizedUser()?.address?.toLowerCase();
    const connected = walletAccount()?.toLowerCase();
    const profileAddr = u?.address?.toLowerCase();
    return !!authed && !!connected && authed === profileAddr && connected === profileAddr;
  });

  // First menu we need for SAVVA token balance
  const savvaBalanceItems = createMemo(() => ([
    { label: t("wallet.menu.transfer"), onClick: () => props.onTransfer?.() },
    { label: t("wallet.menu.increaseStaking"), onClick: () => props.onIncreaseStaking?.() },
  ]));

  // Allow custom items via props; default to SAVVA balance menu
  const items = () => props.items || savvaBalanceItems();

  // Position: small circular button hugging the value on its right
  const positionClass = props.positionClass || "absolute -top-2 -right-2 z-10";

  if (!isOwnWallet()) return null;

  return (
    <div class="relative inline-block">
      {/* anchor is the parent value container */}
      <ContextMenu items={items()} positionClass={positionClass} />
    </div>
  );
}
