// src/x/ui/icons/ActionIcons.jsx
export function EditIcon(props) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class={props.class || "w-5 h-5"} fill="currentColor">
      <path d="M20.71,3.29a2.91,2.91,0,0,0-2.2-.84,3.25,3.25,0,0,0-2.17,1L9.46,10.29s0,0,0,0a.62.62,0,0,0-.11.17,1,1,0,0,0-.1.18l0,0,L8,14.72A1,1,0,0,0,9,16a.9.9,0,0,0,.28,0l4-1.17,0,0,.18-.1a.62.62,0,0,0,.17-.11l0,0,6.87-6.88a3.25,3.25,0,0,0,1-2.17A2.91,2.91,0,0,0,20.71,3.29Z"></path>
      <path d="M20,22H4a2,2,0,0,1-2-2V4A2,2,0,0,1,4,2h8a1,1,0,0,1,0,2H4V20H20V12a1,1,0,0,1,2,0v8A2,2,0,0,1,20,22Z"></path>
    </svg>
  );
}

export function ChevronDownIcon(props) {
  return (
    <svg viewBox="0 0 16 16" class={props.class || "w-4 h-4"} aria-hidden="true" fill="currentColor">
      <path d="M8 11.25a.75.75 0 01-.53-.22l-4-4a.75.75 0 111.06-1.06L8 9.94l3.47-3.47a.75.75 0 111.06 1.06l-4 4a.75.75 0 01-.53.22z" />
    </svg>
  );
}

export function QuestionIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-5 h-5"} aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 14.75a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5zM12 5.5a4 4 0 00-4 4 1 1 0 102 0 2 2 0 113.25 1.53c-.43.34-.78.67-1.05 1.02-.38.5-.7 1.1-.7 1.95v.25a1 1 0 102 0c0-.38.12-.62.32-.88.23-.31.57-.59.99-.92A3.5 3.5 0 0012 5.5z"/>
    </svg>
  );
}

export function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-5 h-5"} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  );
}


