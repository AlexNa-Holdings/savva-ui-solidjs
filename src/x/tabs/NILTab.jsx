// src/x/tabs/NILTab.jsx
import ContentFeed from "../feed/ContentFeed.jsx";

const HEADER_H = 48; // header height for min page height

export default function NILTab(props) {
  // mock async page loader; replace with backend fetcher later
  async function fetchPage(page, pageSize) {
    await new Promise((r) => setTimeout(r, 250));
    if (page > 6) return [];
    return Array.from({ length: pageSize }, (_, i) => ({
      id: `nil_${page}_${i}`,
      text: `NIL content item ${page}-${i}: long text to demonstrate scrolling.`,
    }));
  }

  return (
    <section class="w-full" style={{ "min-height": `calc(100vh - ${HEADER_H}px)` }}>
      <ContentFeed
        mode={props.tab?._raw?.mode === "grid" ? "grid" : "list"}
        fetchPage={fetchPage}
      />
    </section>
  );
}
