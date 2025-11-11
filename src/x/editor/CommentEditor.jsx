// src/x/editor/CommentEditor.jsx
import { createResource, Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { toChecksumAddress } from "../../blockchain/utils.js";
import Spinner from "../ui/Spinner.jsx";
import { whenWsOpen } from "../../net/wsRuntime.js";
import { useHashRouter } from "../../routing/smartRouter.js";
import ContentCard from "../post/ContentCard.jsx";
import useUserProfile, { selectField } from "../profile/userProfileStore";
import { loadNsfwPreference } from "../preferences/storage.js";

async function fetchPost(params) {
  const { app, savva_cid } = params;
  if (!app.wsMethod || !savva_cid) return null;

  const showNsfw = () => {
    const pref = loadNsfwPreference();
    return pref === "s" || pref === "w";
  };

  await whenWsOpen();
  const getList = app.wsMethod("content-list");

  const requestParams = {
    domain: app.selectedDomainName(),
    savva_cid: savva_cid,
    limit: 1,
    show_nsfw: showNsfw(),
  };

  const user = app.authorizedUser();
  if (user?.address) {
    requestParams.my_addr = toChecksumAddress(user.address);
  }

  try {
    const res = await getList(requestParams);
    const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
    return arr[0] ? { id: arr[0].savva_cid, _raw: arr[0] } : null;
  } catch (err) {
    console.error(`Failed to fetch post '${savva_cid}':`, err);
    return { error: err.message };
  }
}

export default function CommentEditor(props) {
  const app = useApp();
  const { t } = app;
  const { route } = useHashRouter();

  const [postData] = createResource(
    () => ({ app: app, savva_cid: props.savva_cid }),
    fetchPost
  );

  // Is current route the edit-comment page?
  const isEditCommentRoute = createMemo(() => String(route() || "").startsWith("/editor/comment/")); // :contentReference[oaicite:2]{index=2}

  // Is the loaded item itself a comment?
  const isComment = createMemo(() => {
    const raw = postData()?._raw;
    const parent = raw?.savva_content?.parent_savva_cid;
    return !!parent && String(parent).length > 0;
  }); // original logic existed here before. :contentReference[oaicite:3]{index=3}

  // When editing a comment, show its parent on top.
  const shouldShowParent = createMemo(() => isEditCommentRoute() && isComment());

  const [parentData] = createResource(
    () => ({
      shouldFetch: shouldShowParent(),
      app: app,
      savva_cid: postData()?._raw?.savva_content?.parent_savva_cid,
    }),
    async (params) => (params.shouldFetch && params.savva_cid ? fetchPost(params) : null)
  );

  const loading = createMemo(
    () => postData.loading || (shouldShowParent() && parentData.loading)
  );
  const errorMsg = createMemo(() => postData.error || parentData.error);
  const cardData = createMemo(() => (shouldShowParent() ? parentData() : postData()));

  return (
    <div class="mb-4">
      <Show when={loading()}>
        <div class="flex justify-center items-center h-24">
          <Spinner />
        </div>
      </Show>

      <Show when={errorMsg()}>
        <p class="text-xs text-[hsl(var(--destructive))]">
          {t("common.error")}: {errorMsg()}
        </p>
      </Show>

      <Show when={!loading() && !errorMsg() && cardData()}>
        <ContentCard item={cardData()} mode="list" compact={false} />
      </Show>
    </div>
  );
}
