// src/components/layout/Container.jsx
export default function Container(props) {
  return <div class={`sv-container ${props.class || ""}`}>{props.children}</div>;
}
