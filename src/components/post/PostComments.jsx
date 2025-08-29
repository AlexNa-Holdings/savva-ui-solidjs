// src/components/post/PostComments.jsx
import { createMemo, createResource, For, Show, createSignal, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext";
import { toChecksumAddress } from "../../blockchain/utils";
import Spinner from "../ui/Spinner";
import CommentCard from "./CommentCard";

function buildCommentTree(comments, rootPostId) {
  if (!comments || comments.length === 0) return [];
  
  const map = new Map();
  const roots = [];

  // First pass: create a map and initialize children array
  for (const comment of comments) {
    comment.children = [];
    map.set(comment.savva_cid, comment);
  }

  // Second pass: build the tree
  for (const comment of comments) {
    const parentId = comment.savva_content?.parent_post;
    if (parentId === rootPostId) {
      roots.push(comment);
    } else if (map.has(parentId)) {
      map.get(parentId).children.push(comment);
    }
  }
  
  return roots;
}

async function fetchComments(params) {
  const { app, postId, offset = 0 } = params;
  if (!app.wsMethod || !postId) return { list: [], nextOffset: null };

  const getChildren = app.wsMethod("content-children");
  const requestParams = {
    domain: app.selectedDomainName(),
    savva_cid: postId,
    max_deep: 4,
    limit: 20,
    offset: offset,
  };

  const user = app.authorizedUser();
  if (user?.address) {
    requestParams.my_addr = toChecksumAddress(user.address);
  }

  try {
    const res = await getChildren(requestParams);
    const list = Array.isArray(res?.list) ? res.list : [];
    const nextOffset = res?.next_offset > 0 ? res.next_offset : null;
    return { list, nextOffset };
  } catch (err) {
    console.error(`Failed to fetch comments for post '${postId}':`, err);
    return { list: [], nextOffset: null, error: err.message };
  }
}

// --- TEMPORARY DEBUGGING DATA ---
const dummyComment = {
  author: {
    name: "testuser",
    staked: "5000000000000000000000",
  },
  savva_content: {
    locales: {
      en: { text_preview: "This is a test comment to verify rendering." }
    }
  },
  effective_time: new Date().toISOString(),
  reactions: [5, 2],
  children: [
    {
      author: { name: "reply_user" },
      savva_content: { locales: { en: { text_preview: "This is a nested reply." } } },
      effective_time: new Date().toISOString(),
      reactions: [1],
      children: []
    }
  ]
};
// --- END TEMPORARY DEBUGGING DATA ---

export default function PostComments(props) {
  const app = useApp();
  // ... all data fetching logic remains but is unused by the temporary JSX ...
  const postId = () => props.post?.savva_cid;
  const [comments, setComments] = createSignal([]);
  const [nextOffset, setNextOffset] = createSignal(0);
  const [isLoading, setIsLoading] = createSignal(false);
  const [initialData] = createResource(() => ({ app, postId: postId() }), fetchComments);
  createEffect(() => {
    const data = initialData();
    if (data && !initialData.loading) {
      setComments(data.list || []);
      setNextOffset(data.nextOffset);
    }
  });


  return (
    <div class="mt-8 pt-6 border-t border-[hsl(var(--border))]">
      <h3 class="text-xl font-semibold mb-4">Comments</h3>
      
      {/* --- TEMPORARY DEBUGGING JSX --- */}
      <div class="space-y-4">
        <CommentCard comment={dummyComment} />
      </div>
      {/* --- END TEMPORARY JSX --- */}

    </div>
  );
}