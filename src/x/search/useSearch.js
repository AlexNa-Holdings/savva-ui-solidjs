// src/x/search/useSearch.js
import { createSignal, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

/**
 * Check if a string is a valid Ethereum address.
 * Must start with 0x, be 42 characters long, and contain only hex characters.
 */
function isValidEthAddress(str) {
  if (!str || typeof str !== "string") return false;
  return /^0x[a-fA-F0-9]{40}$/.test(str);
}

export default function useSearch(querySignal) {
  const app = useApp();

  const [users, setUsers] = createSignal([]);
  const [posts, setPosts] = createSignal([]);

  const [loadingUsers, setLoadingUsers] = createSignal(false);
  const [loadingPosts, setLoadingPosts] = createSignal(false);

  const [hasMoreUsers, setHasMoreUsers] = createSignal(false);
  const [hasMorePosts, setHasMorePosts] = createSignal(false);

  // offsets for pagination
  let uOffset = 0;
  let pOffset = 0;
  const U_LIMIT = 10;
  const P_LIMIT = 12;

  let reqId = 0;
  let debounceTimer;

  function reset() {
    setUsers([]);
    setPosts([]);
    setHasMoreUsers(false);
    setHasMorePosts(false);
    uOffset = 0;
    pOffset = 0;
  }

  async function fetchUsers(q, rid, { append = false } = {}) {
    if (!q) {
      setUsers([]);
      setHasMoreUsers(false);
      return;
    }
    setLoadingUsers(true);
    try {
      const method = app.wsMethod?.("search-user");
      const res = method ? await method({ query: q, limit: U_LIMIT, offset: uOffset, domain: app.selectedDomainName?.() }) : [];
      if (rid !== reqId) return;
      let list = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];

      // If query is a valid Ethereum address and not in results, add it as a potential user
      if (!append && isValidEthAddress(q)) {
        const qLower = q.toLowerCase();
        const alreadyInResults = list.some(
          (u) => u?.address?.toLowerCase() === qLower
        );
        if (!alreadyInResults) {
          // Add a synthetic user entry for the address
          list = [{ address: q, _isAddressSearch: true }, ...list];
        }
      }

      setUsers((prev) => (append ? [...prev, ...list] : list));
      setHasMoreUsers(list.length >= U_LIMIT);
      if (list.length) uOffset += list.length;
    } catch {
      if (rid === reqId) {
        setUsers([]);
        setHasMoreUsers(false);
      }
    } finally {
      if (rid === reqId) setLoadingUsers(false);
    }
  }

  async function fetchPosts(q, rid, { append = false } = {}) {
    if (!q || q.length < 3) {
      setPosts([]);
      setHasMorePosts(false);
      return;
    }
    setLoadingPosts(true);
    try {
      const method = app.wsMethod?.("fts");
      const res = method
        ? await method({
            domain: app.selectedDomainName?.(),
            language: "",
            query: q,
            limit: P_LIMIT,
            offset: pOffset,
          })
        : [];
      if (rid !== reqId) return;
      const list = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
      setPosts((prev) => (append ? [...prev, ...list] : list));
      setHasMorePosts(list.length >= P_LIMIT);
      if (list.length) pOffset += list.length;
    } catch {
      if (rid === reqId) {
        setPosts([]);
        setHasMorePosts(false);
      }
    } finally {
      if (rid === reqId) setLoadingPosts(false);
    }
  }

  createEffect(() => {
    const q = (querySignal?.() || "").trim();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      reqId++;
      reset();
      const rid = reqId;
      fetchUsers(q, rid, { append: false });
      fetchPosts(q, rid, { append: false });
    }, 250);
  });

  const loadMoreUsers = () => {
    const q = (querySignal?.() || "").trim();
    if (!q || loadingUsers() || !hasMoreUsers()) return;
    const rid = reqId;
    fetchUsers(q, rid, { append: true });
  };

  const loadMorePosts = () => {
    const q = (querySignal?.() || "").trim();
    if (!q || q.length < 3 || loadingPosts() || !hasMorePosts()) return;
    const rid = reqId;
    fetchPosts(q, rid, { append: true });
  };

  return {
    users,
    posts,
    loadingUsers,
    loadingPosts,
    hasMoreUsers,
    hasMorePosts,
    loadMoreUsers,
    loadMorePosts,
  };
}
