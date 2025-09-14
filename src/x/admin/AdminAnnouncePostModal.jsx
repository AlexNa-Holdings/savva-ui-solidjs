// src/x/admin/AdminAnnouncePostModal.jsx
import { createMemo, createSignal, For, Show, onMount, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Modal from "../modals/Modal.jsx";
import PostCard from "../post/PostCard.jsx";
import { loadAssetResource } from "../../utils/assetLoader.js";
import { listAddPost } from "../../blockchain/adminCommands.js";
import { pushToast } from "../../ui/toast.js";
import { dbg } from "../../utils/debug.js";

export default function AdminAnnouncePostModal(props) {
  const app = useApp();
  const { t } = app;
  const post = () => props.post || {};

  const currentLang = () => (app?.lang?.() || app?.locale?.() || "en").toString().toLowerCase();
  const domainCfg = createMemo(() => app?.domainAssetsConfig?.() || null);

  const [contentListsRaw, setContentListsRaw] = createSignal(null);
  const [submitting, setSubmitting] = createSignal(false);

  function asObj(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  }

  async function resolveContentLists(cfg) {
    try {
      const store1 = typeof app?.contentLists === "function" ? app.contentLists() : app?.contentLists;
      if (asObj(store1)) {
        setContentListsRaw(asObj(store1.list) || asObj(store1));
        return;
      }

      const mod = cfg?.modules?.content_lists;
      if (typeof mod === "string") {
        const data = await loadAssetResource(app, mod, { type: "yaml" }).catch((e) => {
          dbg.warn("AdminAnnouncePostModal: failed to load content_lists YAML", { mod, e });
          return null;
        });
        const obj = asObj(data?.list) || asObj(data);
        if (obj) { setContentListsRaw(obj); return; }
      } else if (asObj(mod)) {
        setContentListsRaw(asObj(mod.list) || asObj(mod));
        return;
      }

      if (asObj(cfg?.content_lists)) {
        setContentListsRaw(asObj(cfg.content_lists.list) || asObj(cfg.content_lists));
        return;
      }
      if (asObj(cfg?.list)) {
        setContentListsRaw(asObj(cfg.list));
        return;
      }

      dbg.log("AdminAnnouncePostModal: no content lists found in domain config", { cfg });
      setContentListsRaw(null);
    } catch (e) {
      dbg.error("AdminAnnouncePostModal: resolveContentLists error", e);
      setContentListsRaw(null);
    }
  }

  createEffect(() => {
    const cfg = domainCfg();
    if (cfg) resolveContentLists(cfg);
  });

  const lists = createMemo(() => {
    const obj = contentListsRaw();
    if (!asObj(obj)) return [];
    return Object.entries(obj).map(([id, data]) => ({ id, ...(data || {}) }));
  });

  const titleFor = (entry) => {
    const titles = entry?.title || {};
    return (
      titles[currentLang()] ||
      titles.en || titles.ru || titles.fr || titles.ua ||
      entry?.id || ""
    );
  };

  const [selectedList, setSelectedList] = createSignal("");
  const [position, setPosition] = createSignal(0);
  const [pin, setPin] = createSignal(false);

  onMount(() => {
    dbg.log("AdminAnnouncePostModal:init", {
      lang: currentLang(),
      cfgModules: domainCfg()?.modules,
      postKeys: Object.keys(post() || {}),
    });
  });

  createEffect(() => {
    if (!selectedList() && lists().length > 0) {
      setSelectedList(lists()[0].id);
    }
  });

  const savvaCid = createMemo(
    () =>
      post().savva_cid ||
      post().savvaCID ||
      post().id ||
      post()?._raw?.savva_cid ||
      post()?._raw?.savvaCID ||
      post()?._raw?.id ||
      ""
  );

  function close() {
    try { props.onClose?.(); } catch {}
  }

  async function confirm() {
    const payload = {
      savva_cid: savvaCid(),
      list_id: selectedList() || "",
      position: Number.isFinite(+position()) ? +position() : 0,
      pin: !!pin(),
      post: post(),
    };
    dbg.log("AdminAnnouncePostModal:confirm", payload);

    try {
      setSubmitting(true);

      await listAddPost(app, {
        listId: payload.list_id,
        savvaCid: payload.savva_cid,
        position: payload.position,
        pin: payload.pin,
      });

      try {
        window.dispatchEvent(
          new CustomEvent("savva:admin-action", {
            detail: { action: "announce-post:confirm", ...payload },
          })
        );
      } catch {}

      pushToast({ type: "success", message: t("admin.announceSuccess") });
      close();
    } catch (e) {
      dbg.error("AdminAnnouncePostModal: listAddPost failed", e);
      pushToast({
        type: "error",
        message: t("admin.announceError"),
        details: { error: String(e?.message || e) },
        autohideMs: 12000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={close}
      size="xl"
      header={
        <div>
          <h3 class="text-lg font-semibold">{t("admin.announceTitle")}</h3>
          <p class="mt-1 text-sm opacity-80">{t("admin.announceHint")}</p>
        </div>
      }
      footer={
        <div class="px-2 py-1 flex items-center justify-end gap-3">
          <button
            class="px-4 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
            onClick={close}
            disabled={submitting()}
          >
            {t("common.cancel")}
          </button>
          <button
            class="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
            disabled={submitting() || !savvaCid() || lists().length === 0}
            onClick={confirm}
          >
            {submitting() ? t("common.working") : t("admin.announceCta")}
          </button>
        </div>
      }
    >
      <div class="space-y-5 max-h-[calc(100vh-16rem)] overflow-y-auto">
        <div class="rounded-xl border border-[hsl(var(--border))] overflow-hidden">
          <PostCard item={props.post} noContextMenu={true} mode="list" compact isRailVisible={false} />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <div class="md:col-span-2">
            <label class="text-sm font-medium block mb-1">
              {t("admin.announceList")}
            </label>
            <div class="relative">
              <select
                class="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                value={selectedList()}
                onInput={(e) => setSelectedList(e.currentTarget.value)}
              >
                <For each={lists()}>
                  {(entry) => (
                    <option value={entry.id}>
                      {entry.id} — {titleFor(entry)}
                    </option>
                  )}
                </For>
              </select>
            </div>
            <Show when={lists().length === 0}>
              <div class="mt-2 text-xs opacity-70">
                {t("admin.announceNoLists")}
              </div>
            </Show>
          </div>

          <div>
            <label class="text-sm font-medium block mb-1">
              {t("admin.announcePosition")}
            </label>
            <input
              type="number"
              class="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              value={position()}
              onInput={(e) => setPosition(e.currentTarget.value)}
              min="0"
            />
            <div class="mt-1 text-xs opacity-70">
              {t("admin.announcePositionHint")}
            </div>
          </div>

          <div class="md:col-span-3">
            <label class="inline-flex items-center gap-2">
              <input
                type="checkbox"
                class="h-4 w-4 accent-[hsl(var(--primary))]"
                checked={pin()}
                onInput={(e) => setPin(e.currentTarget.checked)}
              />
              <span class="text-sm">{t("admin.announcePin")}</span>
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
}
