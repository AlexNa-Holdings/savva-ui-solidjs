// src/x/ui/IpfsImage.jsx
import { createSignal, createEffect, Show, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { ipfs } from "../../ipfs/index.js";
import Spinner from "./Spinner.jsx";

export default function IpfsImage(props) {
  const app = useApp();
  const [imageUrl, setImageUrl] = createSignal(null);
  const [loading, setLoading] = createSignal(true);

  createEffect(async () => {
    setLoading(true);
    setImageUrl(null);

    const gateways = app.activeIpfsGateways();
    if (!props.src || gateways.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const { url } = await ipfs.fetchBest(app, props.src, { postGateways: props.postGateways });
      setImageUrl(url);
    } catch (e) {
      // Fallback silently on any error, but keep the log for debugging.
      console.error(`[IpfsImage] All gateways failed for ${props.src}:`, e.causes || e);
    } finally {
      setLoading(false);
    }
  });

  const fill = props.fill !== false; // default: fill parent box
  const containerBase = fill ? "relative w-full h-full" : "relative w-full";
  const imgClass = fill ? "absolute inset-0 w-full h-full object-cover" : "block w-full h-auto object-cover";
  const spinnerClass = fill
    ? "absolute inset-0 flex items-center justify-center bg-[hsl(var(--muted))]"
    : "flex items-center justify-center py-8";

  return (
    <div class={`${containerBase} ${props.class || ""}`}>
      <Switch>
        <Match when={loading()}>
          <div class={spinnerClass}>
            <Spinner />
          </div>
        </Match>
        <Match when={imageUrl()}>
          <img
            src={imageUrl()}
            alt={props.alt || "IPFS Image"}
            class={imgClass}
            onError={() => setImageUrl(null)}
          />
        </Match>
        <Match when={!imageUrl()}>
          {props.fallback}
        </Match>
      </Switch>
    </div>
  );
}
