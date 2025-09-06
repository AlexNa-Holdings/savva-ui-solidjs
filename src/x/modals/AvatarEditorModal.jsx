// src/x/profile/AvatarEditorModal.jsx
import { createSignal, onCleanup, Show, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Spinner from "../ui/Spinner.jsx";

const CROP_SIZE = 256;
const HANDLE_VISUAL = 12;   // drawn handle square
const HANDLE_HOT = 22;      // generous hit area for mouse
const MIN_SIZE = 48;

export default function AvatarEditorModal(props) {
  const app = useApp();
  const { t } = app;

  const [imgEl, setImgEl] = createSignal(null);
  const [crop, setCrop] = createSignal({ x: 10, y: 10, size: 200 });
  const [drag, setDrag] = createSignal(null); // {mode:'drag'|'tl'|'br', startX, startY, startCrop}
  const [processing, setProcessing] = createSignal(false);

  // actor-aware subject (who the avatar belongs to)
  const subjectAddr = () => props.subjectAddr || app.actorAddress?.() || app.authorizedUser?.()?.address || "";

  let canvas;
  let fileInput;

  // DPR helpers (we draw in CSS px; canvas backing store scaled by DPR)
  const dpr = () => (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const cssRect = () => {
    const wCss = parseInt(canvas?.style.width || "0", 10) || Math.round((canvas?.width || 0) / dpr());
    const hCss = parseInt(canvas?.style.height || "0", 10) || Math.round((canvas?.height || 0) / dpr());
    return { wCss, hCss };
  };
  const canvasPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // Hit-test utils
  const inRect = (p, x, y, w, h) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
  const getHoverAction = (pos) => {
    const c = crop();
    // Corner hot rectangles (generous)
    const tl = { x: c.x, y: c.y, w: HANDLE_HOT, h: HANDLE_HOT };
    const br = { x: c.x + c.size - HANDLE_HOT, y: c.y + c.size - HANDLE_HOT, w: HANDLE_HOT, h: HANDLE_HOT };

    if (inRect(pos, br.x, br.y, br.w, br.h)) return "br";
    if (inRect(pos, tl.x, tl.y, tl.w, tl.h)) return "tl";

    // Inside crop
    if (inRect(pos, c.x, c.y, c.size, c.size)) return "drag";
    return null;
  };
  const setCursor = (pos) => {
    const mode = getHoverAction(pos);
    canvas.style.cursor = mode === "drag" ? "move" : mode ? "se-resize" : "default";
  };

  function fitCanvasToImage(image) {
    const maxCss = 500;
    const aspect = image.width / image.height;
    const cssW = aspect > 1 ? maxCss : Math.round(maxCss * aspect);
    const cssH = aspect > 1 ? Math.round(maxCss / aspect) : maxCss;

    const ratio = dpr();
    canvas.width = Math.round(cssW * ratio);
    canvas.height = Math.round(cssH * ratio);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";

    const initial = Math.floor(Math.min(cssW, cssH) * 0.8);
    setCrop({
      x: Math.round((cssW - initial) / 2),
      y: Math.round((cssH - initial) / 2),
      size: Math.max(initial, MIN_SIZE),
    });
  }

  function draw() {
    const image = imgEl();
    if (!canvas || !image) return;

    const { wCss, hCss } = cssRect();
    const ratio = dpr();
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); // draw in CSS px
    ctx.clearRect(0, 0, wCss, hCss);

    // base
    ctx.drawImage(image, 0, 0, wCss, hCss);

    // dim
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, wCss, hCss);

    // crop window
    const c = crop();
    ctx.save();
    ctx.beginPath();
    ctx.rect(c.x, c.y, c.size, c.size);
    ctx.clip();
    ctx.drawImage(image, 0, 0, wCss, hCss);
    ctx.restore();

    // outline
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x, c.y, c.size, c.size);

    // visual handles (TL & BR)
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    // TL
    ctx.fillRect(c.x - 1, c.y - 1, HANDLE_VISUAL, HANDLE_VISUAL);
    // BR
    ctx.fillRect(c.x + c.size - HANDLE_VISUAL + 1, c.y + c.size - HANDLE_VISUAL + 1, HANDLE_VISUAL, HANDLE_VISUAL);

    ctx.restore();
  }

  createEffect(draw);
  createEffect(() => { props.isOpen && draw(); });

  function onDown(e) {
    e.preventDefault();
    const p = canvasPoint(e);
    const mode = getHoverAction(p);
    if (!mode) return;
    setDrag({ mode, startX: p.x, startY: p.y, startCrop: { ...crop() } });
  }

  function onMove(e) {
    const p = canvasPoint(e);
    const state = drag();
    if (!state) {
      setCursor(p);
      return;
    }

    const { wCss, hCss } = cssRect();
    const { mode, startX, startY, startCrop } = state;
    const dx = p.x - startX;
    const dy = p.y - startY;

    if (mode === "drag") {
      const nx = Math.max(0, Math.min(startCrop.x + dx, wCss - startCrop.size));
      const ny = Math.max(0, Math.min(startCrop.y + dy, hCss - startCrop.size));
      setCrop({ x: nx, y: ny, size: startCrop.size });
    } else if (mode === "br") {
      // resize from bottom-right; clamp against canvas using original TL
      const grow = Math.max(dx, dy);
      let size = Math.max(MIN_SIZE, Math.min(startCrop.size + grow, wCss - startCrop.x, hCss - startCrop.y));
      setCrop({ x: startCrop.x, y: startCrop.y, size });
    } else if (mode === "tl") {
      // resize from top-left; keep BR fixed
      const delta = Math.min(dx, dy); // move right/down => shrink
      let x = startCrop.x + delta;
      let y = startCrop.y + delta;
      let size = Math.max(MIN_SIZE, startCrop.size - delta);
      if (x < 0) { size += x; x = 0; }
      if (y < 0) { size += y; y = 0; }
      size = Math.min(size, (startCrop.y + startCrop.size) - y, (startCrop.x + startCrop.size) - x);
      setCrop({ x, y, size: Math.max(MIN_SIZE, size) });
    }

    draw();
  }

  function onUp() { setDrag(null); }

  function onFileChange(e) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const i = new Image();
      i.onload = () => {
        setImgEl(i);
        fitCanvasToImage(i);
        draw();
      };
      i.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  }

  createEffect(() => {
    if (!props.isOpen) return;
    setImgEl(null);
    setTimeout(() => fileInput?.click(), 0);

    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      setTimeout(() => {
        if (!fileInput?.files?.length) props.onClose?.();
      }, 300);
    };
    window.addEventListener("focus", onFocus);
    onCleanup(() => window.removeEventListener("focus", onFocus));
  });

  async function onSave() {
    const image = imgEl();
    if (!image) return;
    setProcessing(true);

    const { wCss } = cssRect();
    const scaleX = image.naturalWidth / wCss;
    const c = crop();

    const sx = Math.max(0, Math.round(c.x * scaleX));
    const sy = Math.max(0, Math.round(c.y * scaleX));
    const sSize = Math.min(
      image.naturalWidth - sx,
      image.naturalHeight - sy,
      Math.round(c.size * scaleX)
    );

    const out = document.createElement("canvas");
    out.width = CROP_SIZE;
    out.height = CROP_SIZE;
    const octx = out.getContext("2d");
    octx.imageSmoothingQuality = "high";
    octx.drawImage(image, sx, sy, sSize, sSize, 0, 0, CROP_SIZE, CROP_SIZE);

    out.toBlob(async (blob) => {
      try {
        if (!blob) throw new Error("Render failed");
        // Actor-aware: pass the subject address (self or selected NPO) to the caller
        await props.onSave?.(blob, subjectAddr());
        props.onClose?.();
      } finally {
        setProcessing(false);
      }
    }, "image/png");
  }

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-[60] flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" onClick={props.onClose} />
        <div class="relative themed-dialog rounded-lg shadow-lg w-full max-w-lg p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
          <h3 class="text-lg font-semibold mb-4">{t("profile.edit.avatar.title")}</h3>

          <input
            type="file"
            ref={el => (fileInput = el)}
            class="hidden"
            accept="image/*"
            onChange={onFileChange}
          />

          <div class="flex justify-center items-center mb-4 min-h-[200px]">
            <Show when={imgEl()} fallback={<p>{t("profile.edit.avatar.select")}</p>}>
              <canvas
                ref={el => (canvas = el)}
                class="max-w-full max-h-[60vh] touch-none select-none"
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={onUp}
                onMouseLeave={onUp}
              />
            </Show>
          </div>

          <div class="flex gap-2 justify-end mt-4">
            <button
              class="px-3 py-2 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90"
              onClick={props.onClose}
            >
              {t("common.cancel")}
            </button>
            <button
              class="px-3 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
              onClick={onSave}
              disabled={processing() || !imgEl()}
            >
              <Show when={processing()} fallback={<span>{t("profile.edit.avatar.save")}</span>}>
                <Spinner class="w-5 h-5" />
              </Show>
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
