// src/x/modals/ModalBackdrop.jsx
export default function ModalBackdrop(props) {
  return (
    <div
      class={`fixed inset-0  sv-modal-overlay ${props.class || ""}`}
      onClick={props.onClick}
      role="presentation"
    />
  );
}
