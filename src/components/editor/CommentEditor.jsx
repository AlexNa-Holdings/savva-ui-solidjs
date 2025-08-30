// src/components/editor/CommentEditor.jsx
import { createResource, Show } from "solid-js";
import { useApp } from "../../context/AppContext";
import { toChecksumAddress } from "../../blockchain/utils";
import PostCard from "../feed/PostCard";
import Spinner from "../ui/Spinner";
import { whenWsOpen } from "../../net/wsRuntime.js";

async function fetchPost(params) {
  const { app, savva_cid } = params;
  if (!app.wsMethod || !savva_cid) return null;

  await whenWsOpen();
  const getList = app.wsMethod("content-list");
  
  const requestParams = {
    domain: app.selectedDomainName(),
    savva_cid: savva_cid,
    limit: 1,
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
  
  const [postData] = createResource(() => ({
    app: app,
    savva_cid: props.savva_cid
  }), fetchPost);

  return (
    <div class="mb-4">
      <Show when={postData.loading}>
        <div class="flex justify-center items-center h-24">
          <Spinner />
        </div>
      </Show>
      <Show when={postData.error}>
        <p class="text-xs text-[hsl(var(--destructive))]">
          {t("common.error")}: {postData.error}
        </p>
      </Show>
      <Show when={!postData.loading && !postData.error && postData()}>
        <PostCard
          item={postData()}
          mode="list"
          compact={false}
        />
      </Show>
    </div>
  );
}