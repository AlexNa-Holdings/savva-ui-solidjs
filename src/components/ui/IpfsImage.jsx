// src/components/ui/IpfsImage.jsx
import { createSignal, createEffect, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { ipfs } from "../../ipfs/index.js";
import { pushErrorToast } from "./toast.js";
import Spinner from "./Spinner.jsx";

export default function IpfsImage(props) {
  const app = useApp();
  const [imageUrl, setImageUrl] = createSignal(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(false);

  createEffect(async () => {
    setLoading(true);
    setError(false);
    setImageUrl(null);

    const gateways = app.activeIpfsGateways();
    if (!props.src || gateways.length === 0) {
      console.warn("[IpfsImage] Aborting: No src or no gateways available.", { src: props.src, gateways });
      setError(true);
      setLoading(false);
      return;
    }

    try {
      const { url } = await ipfs.fetchBest(app, props.src);
      setImageUrl(url);
    } catch (e) {
      pushErrorToast(e, {
        context: "IPFS image failed to load.",
        cid: props.src,
      });
      
      console.error(`[IpfsImage] All gateways failed for ${props.src}:`, e.causes || e);
      setError(true);
    } finally {
      setLoading(false);
    }
  });

  return (
    <div class={`relative w-full h-full ${props.class || ""}`}>
      <Show when={loading()}>
        <div class="absolute inset-0 flex items-center justify-center bg-[hsl(var(--muted))]">
          <Spinner />
        </div>
      </Show>
      <Show when={!loading() && imageUrl()}>
        <img
          src={imageUrl()}
          alt={props.alt || "IPFS Image"}
          class="absolute inset-0 w-full h-full object-cover"
        />
      </Show>
      <Show when={!loading() && error()}>
        <div class="absolute inset-0 flex items-center justify-center bg-[hsl(var(--muted))]">
          {/* Error icon can go here */}
        </div>
      </Show>
    </div>
  );
}