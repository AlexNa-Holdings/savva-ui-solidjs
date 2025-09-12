// src/x/admin/AdminActionsBridge.jsx
import { createSignal, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { banPost, banUser } from "../../blockchain/adminCommands.js";
import { pushErrorToast } from "../../ui/toast.js";
import AdminConfirmBanModal from "./AdminConfirmBanModal.jsx";

export default function AdminActionsBridge() {
  const app = useApp();
  const { t } = app;
  const [open, setOpen] = createSignal(false);
  const [state, setState] = createSignal({ action: "", savva_cid: "", author: "", post: null });

  function showConfirm(detail) {
    setState({
      action: detail.action,
      savva_cid: detail.savva_cid || detail.cid || detail.id || "",
      author: detail.author || detail.address || detail.user_addr || "",
      post: detail.post || null,
    });
    setOpen(true);
  }

  async function onConfirm(comment) {
    const s = state();
    try {
      if (s.action === "ban-post") {
        await banPost(app, { savvaCid: s.savva_cid, comment });
      } else if (s.action === "ban-user") {
        await banUser(app, { authorAddress: s.author, comment });
      }
      setOpen(false);
    } catch (err) {
      pushErrorToast(err, { context: t("tx.error") });
    }
  }

  const onAction = (e) => {
    const d = e?.detail || {};
    if (d.action === "ban-post" || d.action === "ban-user") {
      showConfirm(d);
    }
  };

  onMount(() => window.addEventListener("savva:admin-action", onAction));
  onCleanup(() => window.removeEventListener("savva:admin-action", onAction));

  return (
    <AdminConfirmBanModal
      open={open()}
      action={state().action}
      savva_cid={state().savva_cid}
      author={state().author}
      post={state().post}
      onConfirm={onConfirm}
      onClose={() => setOpen(false)}
    />
  );
}
