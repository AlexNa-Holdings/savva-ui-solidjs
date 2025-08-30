// src/hooks/useDeleteAction.js
import { createSignal, createMemo } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { getSavvaContract } from "../blockchain/contracts.js";
import { toHexBytes32 } from "../blockchain/utils.js";
import { navigate } from "../routing/hashRouter.js";
import { pushToast, pushErrorToast } from "../ui/toast.js";

export function useDeleteAction(contentObjectAccessor) {
  const app = useApp();
  const { t } = app;
  const [isDeleting, setIsDeleting] = createSignal(false);
  const [showConfirm, setShowConfirm] = createSignal(false);

  const isComment = createMemo(() => !!contentObjectAccessor()?.parent_savva_cid);

  const openConfirm = (e) => {
    e?.stopPropagation();
    setShowConfirm(true);
  };
  
  const closeConfirm = () => setShowConfirm(false);

  const confirmDelete = async () => {
    const content = contentObjectAccessor();
    if (!content) return;

    setIsDeleting(true);
    try {
      const contract = await getSavvaContract(app, "ContentRegistry", { write: true });
      
      const contentType = isComment() ? "comment" : "post";
      
      await contract.write.reg([
          content.domain,
          content.author.address,
          content.guid,
          "", // Empty IPFS field indicates deletion
          toHexBytes32(contentType)
      ]);

      navigate("/");
      pushToast({ type: "success", message: t("delete.toast.success") });
    } catch (err) {
      pushErrorToast(err, { context: t("delete.toast.error") });
    } finally {
      setIsDeleting(false);
      closeConfirm();
    }
  };
  
  const modalProps = createMemo(() => {
    const type = isComment() ? "comment" : "post";
    return {
      title: t(`delete.confirm.${type}.title`),
      message: t("delete.confirm.message"),
      confirmText: isDeleting() ? t("delete.confirm.deleting") : t("delete.confirm.confirm"),
    };
  });

  return { isDeleting, showConfirm, openConfirm, closeConfirm, confirmDelete, modalProps };
}