// src/components/tabs/NewTab.jsx
import ContentFeed from "../feed/ContentFeed.jsx";

export default function NewTab(props) {
  async function fetchPage(page, pageSize) {
    await new Promise((r) => setTimeout(r, 200));
    if (page > 4) return [];
    return Array.from({ length: pageSize }, (_, i) => ({
      id: `new_${page}_${i}`,
      text: `New tab content item ${page}-${i}. Vivamus finibus, sapien sed tempus feugiat, sapien augue facilisis nulla, at vehicula mauris mi eu felis.`
    }));
  }

  return (
    <section class="w-full">
      <ContentFeed
        mode={props.tab?._raw?.mode === "grid" ? "grid" : "list"}
        fetchPage={fetchPage}
      />
    </section>
  );
}
