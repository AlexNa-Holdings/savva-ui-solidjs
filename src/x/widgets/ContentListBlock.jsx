// src/x/widgets/ContentListBlock.jsx
import { createMemo, createResource, For, Show, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { loadAssetResource } from "../../utils/assetLoader.js";
import PostCard from "../post/PostCard.jsx";
import Spinner from "../ui/Spinner.jsx";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { getPinningItems as getPinnedItems } from "../../ui/contextMenuBuilder.js";

function getLocalizedTitle(titleData, currentLang) {
  if (!titleData || typeof titleData !== "object") return "";
  if (titleData[currentLang]) return titleData[currentLang];
  if (titleData["*"]) return titleData["*"];
  if (titleData.en) return titleData.en;
  const firstKey = Object.keys(titleData)[0];
  return firstKey ? titleData[firstKey] : "";
}

async function fetchListContent(params) {
  const { app, listName, count, lang } = params;
  if (!app.wsMethod || !listName) return [];

  const getList = app.wsMethod("get-list");

  const requestParams = {
    domain: app.selectedDomainName(),
    list_name: listName,
    limit: count || 5,
    offset: 0,
    lang,
  };

  const user = app.authorizedUser();
  if (user?.address) {
    requestParams.my_addr = toChecksumAddress(user.address);
  }

  try {
    const res = await getList(requestParams);
    const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
    return arr.map((it) => ({
      id: it?.savva_cid || it?.savvaCID || it?.id,
      _raw: it,
    }));
  } catch (err) {
    console.error(`Failed to fetch content list '${listName}':`, err);
    return { error: err.message };
  }
}

export default function ContentListBlock(props) {
  const app = useApp();
  const modulePath = createMemo(() => app.domainAssetsConfig?.()?.modules?.content_lists);

  const [contentListModule] = createResource(modulePath, async (path) => {
    if (!path) return null;
    try {
      return await loadAssetResource(app, path, { type: "yaml" });
    } catch (e) {
      console.error(`Failed to load content list module from ${path}`, e);
      return null;
    }
  });

  const listName = () => props.block?.list_name;

  const listDefinition = createMemo(() => {
    const name = listName();
    if (!name) return null;
    return contentListModule()?.list?.[name] || null;
  });

  const title = createMemo(() => {
    const def = listDefinition();
    return getLocalizedTitle(def?.title, app.lang());
  });

  const [listData, { refetch }] = createResource(
    () => ({
      app,
      listName: listName(),
      count: props.block?.count,
      lang: app.lang(),
    }),
    fetchListContent
  );

  // Refresh on broadcast: BCM_ListUpdated { list }
  onMount(() => {
    const handleBroadcast = (e) => {
      try {
        const d = e?.detail || {};
        // Accept several shapes to be robust:
        const type = d.type || d.msg_type || d.kind;
        const payload = d.payload || d.data || d;
        const updatedList = payload.list || payload.list_id || d.list;

        // Direct DOM helper event (if someone triggers it): "savva:list-updated"
        const isDomListUpdated = e.type === "savva:list-updated";

        if ((type === "list_updated" || isDomListUpdated) && updatedList && updatedList === listName()) {
          refetch();
        }

        // Also refresh when our own admin actions affect this list
        if (e.type === "savva:admin-action") {
          const act = d.action;
          const affected = d.list_id || d.list;
          if (
            affected === listName() &&
            (act === "list:pinned" || act === "list:unpinned" || act === "list:removed" || act === "announce-post:confirm")
          ) {
            refetch();
          }
        }
      } catch {}
    };

    window.addEventListener("savva:ws-broadcast", handleBroadcast);
    window.addEventListener("savva:list-updated", handleBroadcast);
    window.addEventListener("savva:admin-action", handleBroadcast);

    onCleanup(() => {
      window.removeEventListener("savva:ws-broadcast", handleBroadcast);
      window.removeEventListener("savva:list-updated", handleBroadcast);
      window.removeEventListener("savva:admin-action", handleBroadcast);
    });
  });

  return (
    <div class="p-3 rounded-lg" style={{ background: "var(--gradient)" }}>
      <h4 class="font-semibold text-sm mb-2 text-[hsl(var(--card))]">
        {title() || listName()}
      </h4>
      <div class="space-y-3">
        <Show when={listData.loading}>
          <div class="flex justify-center items-center h-24">
            <Spinner />
          </div>
        </Show>
        <Show when={listData.error}>
          <p class="text-xs text-[hsl(var(--destructive))]">
            {app.t("common.error")}: {listData.error}
          </p>
        </Show>
        <Show when={!listData.loading && !listData.error && Array.isArray(listData()) && listData().length > 0}>
          <For each={listData()}>
            {(item) => {
              const menuItems = getPinnedItems(item._raw || item, app.t, {
                app,
                listId: listName(),
              });

              return (
                <PostCard
                  item={item}
                  mode="list"
                  compact={true}
                  contextMenuItems={menuItems}
                />
              );
            }}
          </For>
        </Show>
      </div>
    </div>
  );
}
