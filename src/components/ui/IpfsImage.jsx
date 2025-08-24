// src/components/ui/IpfsImage.jsx
import { createSignal, createEffect, Show, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { ipfs } from "../../ipfs/index.js";
import { pushErrorToast } from "./toast.js";
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
      const { url } = await ipfs.fetchBest(app, props.src);
      setImageUrl(url);
    } catch (e) {
      // Don't show a toast for 404s, just show the fallback.
      if (!e.is404) {
        pushErrorToast(e, { context: "IPFS image failed to load", cid: props.src });
      }
      console.error(`[IpfsImage] All gateways failed for ${props.src}:`, e.causes || e);
    } finally {
      setLoading(false);
    }
  });

  return (
    <div class={`relative w-full h-full ${props.class || ""}`}>
      <Switch>
        <Match when={loading()}>
          <div class="absolute inset-0 flex items-center justify-center bg-[hsl(var(--muted))]">
            <Spinner />
          </div>
        </Match>
        <Match when={imageUrl()}>
          <img
            src={imageUrl()}
            alt={props.alt || "IPFS Image"}
            class="absolute inset-0 w-full h-full object-cover"
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