// src/x/admin/AdminActionsBridge.jsx
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { pushErrorToast } from "../../ui/toast.js";
import AdminConfirmBanModal from "./AdminConfirmBanModal.jsx";
import { banPost, banUser, sendAdminCommand } from "../../blockchain/adminCommands.js";

export default function AdminActionsBridge() {
  const app = useApp();
  const { t } = app;

  const [open, setOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [action, setAction] = createSignal(null); // "ban-post" | "ban-user"
  const [post, setPost] = createSignal(null);
  const [userAddr, setUserAddr] = createSignal(null);

  const savvaCidOf = (p) => p?.savva_cid || p?.id || p?._raw?.savva_cid || p?._raw?.id;
  const authorOf  = (p) => p?.author?.address || p?._raw?.author?.address;

  // Unban actions are immediate (no comment dialog)
  async function unbanPostNow(detail) {
    try {
      const cid = detail?.savva_cid || savvaCidOf(detail?.post);
      if (!cid) throw new Error("Missing savva_cid");
      await sendAdminCommand(app, { cmd: "unban_post", p1: String(cid) });
      // Success toast comes via WS alert handlers
    } catch (e) {
      pushErrorToast(e, { context: t("tx.error") });
    }
  }

  async function unbanUserNow(detail) {
    try {
      const addr = detail?.author || authorOf(detail?.post) || userAddr();
      if (!addr) throw new Error("Missing author address");
      await sendAdminCommand(app, { cmd: "unban_user", p1: String(addr) });
    } catch (e) {
      pushErrorToast(e, { context: t("tx.error") });
    }
  }

  function openBanPost(detail) {
    setAction("ban-post");
    setPost(detail?.post || null);
    setUserAddr(detail?.author || authorOf(detail?.post) || null);
    setOpen(true);
  }

  function openBanUser(detail) {
    setAction("ban-user");
    setPost(detail?.post || null);
    setUserAddr(detail?.author || authorOf(detail?.post) || null);
    setOpen(true);
  }

  async function handleConfirm(comment) {
    setBusy(true);
    try {
      if (action() === "ban-post") {
        const cid = savvaCidOf(post());
        if (!cid) throw new Error("Missing savva_cid");
        await banPost(app, { savvaCid: cid, comment });
      } else if (action() === "ban-user") {
        const addr = userAddr() || authorOf(post());
        if (!addr) throw new Error("Missing author address");
        await banUser(app, { authorAddress: addr, comment });
      }
      setOpen(false);
      // Result toasts + UI updates arrive via WS BCM handlers
    } catch (e) {
      pushErrorToast(e, { context: t("tx.error") });
    } finally {
      setBusy(false);
    }
  }

  function handleClose() { setOpen(false); }

  onMount(() => {
    const onAdmin = (ev) => {
      const detail = ev?.detail || {};
      switch (detail.action) {
        case "ban-post":  openBanPost(detail);  break;
        case "ban-user":  openBanUser(detail);  break;
        case "unban-post": unbanPostNow(detail); break;
        case "unban-user": unbanUserNow(detail); break;
        default: break;
      }
    };
    window.addEventListener("savva:admin-action", onAdmin);
    onCleanup(() => window.removeEventListener("savva:admin-action", onAdmin));
  });

  return (
    <Show when={open()}>
      <AdminConfirmBanModal
        open={open()}
        action={action()}
        post={post()}
        user={userAddr() ? { address: userAddr() } : undefined}
        onConfirm={handleConfirm}
        onClose={handleClose}
        busy={busy()}
      />
    </Show>
  );
}
