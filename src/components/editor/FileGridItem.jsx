// src/components/editor/FileGridItem.jsx
import { Show, createMemo } from "solid-js";

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" class="w-8 h-8 text-[hsl(var(--muted-foreground))]">
      <path fill="currentColor" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg viewBox="0 0 24 24" class="w-8 h-8 text-[hsl(var(--muted-foreground))]">
      <path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>
  );
}

export default function FileGridItem(props) {
  const fileType = createMemo(() => {
    const name = props.file?.name?.toLowerCase() || "";
    if (/\.(jpe?g|png|gif|webp)$/.test(name)) return "image";
    if (/\.(mp4|webm|ogg)$/.test(name)) return "video";
    if (/\.(mp3|wav|m4a)$/.test(name)) return "audio";
    return "other";
  });

  const handleClick = (e) => {
    e.preventDefault();
    props.onMenuOpen?.({
      file: props.file,
      fileType: fileType(),
      element: e.currentTarget,
    });
  };

  return (
    <div
      class="relative group aspect-square rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] overflow-hidden cursor-pointer"
      onClick={handleClick}
      onContextMenu={handleClick}
    >
      <Show when={fileType() === 'image'}>
        <img src={props.file.url} alt={props.file.name} class="w-full h-full object-cover" />
      </Show>
      <Show when={fileType() === 'video'}>
        <div class="w-full h-full flex items-center justify-center">
          <VideoIcon />
        </div>
      </Show>
      <Show when={fileType() === 'audio'}>
        <div class="w-full h-full flex items-center justify-center">
          <AudioIcon />
        </div>
      </Show>
      <div class="absolute bottom-0 left-0 right-0 p-1.5 bg-black/50 text-white text-[10px] text-center truncate">
        {props.file.name}
      </div>
    </div>
  );
}