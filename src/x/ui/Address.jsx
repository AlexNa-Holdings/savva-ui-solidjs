// src/x/ui/Address.jsx
import { createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { pushToast } from "../../ui/toast.js";
import CopyIcon from "./icons/CopyIcon.jsx";
import { toChecksumAddress } from "../../blockchain/utils.js";

function shortAddr(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function Address(props) {
  const { t } = useApp();
  const checksummedAddress = createMemo(() => {
    try {
      return toChecksumAddress(props.address);
    } catch {
      return "";
    }
  });

  const displayAddress = createMemo(() => {
    const addr = checksummedAddress();
    if (!addr) return "";
    return props.format === 'full' ? addr : shortAddr(addr);
  });

  const handleCopy = (e) => {
    e.stopPropagation();
    const addr = checksummedAddress();
    if (!addr) return;
    navigator.clipboard.writeText(addr).then(() => {
      pushToast({ type: "success", message: t("profile.addressCopied") });
    });
  };

  return (
    <div 
      class="flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] font-mono"
      title={checksummedAddress()}
    >
      <span>{displayAddress()}</span>
      <button onClick={handleCopy} class="hover:text-[hsl(var(--foreground))]">
        <CopyIcon class="w-4 h-4" />
      </button>
    </div>
  );
}
