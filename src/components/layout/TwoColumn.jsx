// src/components/layout/TwoColumn.jsx
export default function TwoColumn(props) {
  // props.aside is the node for the right column
  return (
    <div class="sv-content-grid">
      <section class="sv-main">{props.children}</section>
      {props.aside && <aside class="sv-aside">{props.aside}</aside>}
    </div>
  );
}
