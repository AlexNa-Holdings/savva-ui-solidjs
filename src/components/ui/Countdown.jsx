// src/components/ui/Countdown.jsx
import { createSignal, onCleanup, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

function clamp(n) { return n > 0 ? n : 0; }
function split(totalSec) {
  let s = clamp(totalSec | 0);
  const days = Math.floor(s / 86400); s -= days * 86400;
  const hours = Math.floor(s / 3600); s -= hours * 3600;
  const minutes = Math.floor(s / 60); s -= minutes * 60;
  return { days, hours, minutes, seconds: s };
}

export default function Countdown(props) {
  const { t } = useApp();

  const targetTs = () => Number(props.targetTs || 0);     // UNIX seconds
  const size = () => (props.size === "lg" ? "lg" : "sm");  // "sm" | "lg"
  const anim = () => (props.anim === "reverse" ? "reverse-animation" : "default-animation");

  // Equal box width so all four boxes are identical
  const boxWidth = () => (size() === "lg" ? "7.5ch" : "5.6ch");
  const boxPad   = () => (size() === "lg" ? "px-4 py-3" : "px-2 py-1.5");
  const numClass = () => (size() === "lg" ? "text-2xl" : "text-base");
  const labelClass = () => (size() === "lg" ? "text-xs" : "text-[10px]");

  const [d, setD] = createSignal(0), [ad, setAd] = createSignal(false);
  const [h, setH] = createSignal(0), [ah, setAh] = createSignal(false);
  const [m, setM] = createSignal(0), [am, setAm] = createSignal(false);
  const [s, setS] = createSignal(0), [as, setAs] = createSignal(false);

  let timer;
  const runTick = () => {
    const remain = Math.max(0, targetTs() - Math.floor(Date.now() / 1000));
    const next = split(remain);
    if (next.days    !== d()) { setD(next.days);    setAd(true); setTimeout(() => setAd(false), 380); }
    if (next.hours   !== h()) { setH(next.hours);   setAh(true); setTimeout(() => setAh(false), 380); }
    if (next.minutes !== m()) { setM(next.minutes); setAm(true); setTimeout(() => setAm(false), 380); }
    if (next.seconds !== s()) { setS(next.seconds); setAs(true); setTimeout(() => setAs(false), 380); }
    if (remain === 0 && typeof props.onDone === "function") props.onDone();
  };

  createEffect(() => {
    runTick(); clearInterval(timer);
    timer = setInterval(runTick, 1000);
  });
  onCleanup(() => clearInterval(timer));

  const full = {
    d: t("time.days"),
    h: t("time.hours"),
    m: t("time.minutes"),
    s: t("time.seconds"),
  };
  const short = {
    d: (full.d || "D").slice(0, 1).toUpperCase(),
    h: (full.h || "H").slice(0, 1).toUpperCase(),
    m: (full.m || "M").slice(0, 1).toUpperCase(),
    s: (full.s || "S").slice(0, 1).toUpperCase(),
  };

  const BoxLg = (p) => (
    <div
      class={`flex flex-col items-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] ${boxPad()}`}
      style={{ width: boxWidth() }}
    >
      <div class={`${labelClass()} opacity-80 mb-1`}>{p.label}</div>
      <div class={`${numClass()} font-semibold tabular-nums`} classList={{ [anim()]: p.anim }}>
        {p.value}
      </div>
    </div>
  );

  const BoxSm = (p) => (
    <div
      class={`flex items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] ${boxPad()}`}
      style={{ width: boxWidth() }}
    >
      <span class={`${labelClass()} font-medium w-3 text-center mr-1`}>{p.short}</span>
      <span class={`${numClass()} font-semibold tabular-nums`} classList={{ [anim()]: p.anim }}>
        {p.value}
      </span>
    </div>
  );

  const Box = size() === "lg" ? BoxLg : BoxSm;

  return (
    <div class="flex items-center gap-2" aria-live="polite">
      <Box label={full.d} short={short.d} value={d()} anim={ad()} />
      <Box label={full.h} short={short.h} value={h()} anim={ah()} />
      <Box label={full.m} short={short.m} value={m()} anim={am()} />
      <Box label={full.s} short={short.s} value={s()} anim={as()} />
    </div>
  );
}
