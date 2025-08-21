// File: src/components/tabs/NewTab.jsx
import ContentFeed from "../feed/ContentFeed.jsx";
import { useApp } from "../../context/AppContext.jsx";

export default function NewTab(props) {
  const app = useApp();

  const domainName = () => {
    const d = app.selectedDomain?.();
    return typeof d === "string" ? d : d?.name || "";
  };

  // WS method sugar for 'content-list'
  const contentList = app.wsMethod ? app.wsMethod("content-list") : null;

  async function fetchPage(page, pageSize) {
    // page starts at 1 in ContentFeed’s loader (nextPage = page() + 1)
    const limit = pageSize;
    const offset = (page - 1) * pageSize;

    try {
      if (!contentList) return [];

      const res = await contentList({
        domain: domainName(),
        limit,
        offset,
      });

      // Accept a few common shapes: array or {list|items|data:[...]}
      const arr =
        Array.isArray(res) ? res :
        Array.isArray(res?.list) ? res.list :
        Array.isArray(res?.items) ? res.items :
        Array.isArray(res?.data) ? res.data : [];

      // Normalize into ContentFeed item shape
      return arr.map((it, i) => ({
        id: it?.savva_cid || it?.savvaCID || it?.id || `content_${page}_${i}`,
        text:
          it?.text_preview ||
          it?.textPreview ||
          it?.title ||
          it?.description ||
          it?.summary ||
          "",
        _raw: it,
      }));
    } catch {
      return [];
    }
  }

  return (
    <section class="w-full">
      <ContentFeed
        mode={props.tab?._raw?.mode === "grid" ? "grid" : "list"}
        fetchPage={fetchPage}
        pageSize={12}
      />
    </section>
  );
}
