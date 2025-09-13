// src/x/admin/AdminActionsBridge.jsx
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import AdminConfirmBanModal from "./AdminConfirmBanModal.jsx";

export default function AdminActionsBridge() {
  const app = useApp();
  const { t } = app;

  const [open, setOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [action, setAction] = createSignal(null); // "ban-post" | "ban-user"
  const [post, setPost] = createSignal(null);
  const [userAddr, setUserAddr] = createSignal(null);

  const domain = () => app.selectedDomainName?.() || app.domain?.();

  const savvaCidOf = (p) => p?.savva_cid || p?.id || p?._raw?.savva_cid || p?._raw?.id;
  const authorOf = (p) => p?.author?.address || p?._raw?.author?.address;

  async function callAdmin(cmd, p1, p2) {
    const payload = { domain: domain(), cmd, p1 };
    if (p2 != null && p2 !== "") payload.p2 = p2;
    return wsCall("admin", payload);
  }

  async function unbanPostNow(detail) {
    try {
      const cid = detail?.savva_cid || savvaCidOf(detail?.post);
      if (!cid) throw new Error("Missing savva_cid");
      await callAdmin("unban_post", cid);
      pushToast({ type: "success", message: t("admin.toast.postUnbanned") });
    } catch (e) {
      pushErrorToast(e, { context: t("admin.toast.postUnbanFailed") });
    }
  }

  async function unbanUserNow(detail) {
    try {
      const addr = detail?.author || authorOf(detail?.post) || userAddr();
      if (!addr) throw new Error("Missing author address");
      await callAdmin("unban_user", addr);
      pushToast({ type: "success", message: t("admin.toast.userUnbanned") });
    } catch (e) {
      pushErrorToast(e, { context: t("admin.toast.userUnbanFailed") });
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
        await callAdmin("ban_post", cid, comment);
        pushToast({ type: "success", message: t("admin.toast.postBanned") });
      } else if (action() === "ban-user") {
        const addr = userAddr() || authorOf(post());
        if (!addr) throw new Error("Missing author address");
        await callAdmin("ban_user", addr, comment);
        pushToast({ type: "success", message: t("admin.toast.userBanned") });
      }
      setOpen(false);
    } catch (e) {
      pushErrorToast(e, { context: t("admin.toast.actionFailed") });
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setOpen(false);
  }

  onMount(() => {
    const onAdmin = (ev) => {
      const detail = ev?.detail || {};
      switch (detail.action) {
        case "ban-post":
          openBanPost(detail);
          break;
        case "ban-user":
          openBanUser(detail);
          break;
        case "unban-post":
          unbanPostNow(detail);
          break;
        case "unban-user":
          unbanUserNow(detail);
          break;
        default:
          break;
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
