// src/x/ui/IpfsImage.jsx
import { createSignal, createEffect, Show, Switch, Match, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { ipfs } from "../../ipfs/index.js";
import { fetchBestWithDecryption } from "../../ipfs/encryptedFetch.js";
import Spinner from "./Spinner.jsx";

export default function IpfsImage(props) {
  const app = useApp();
  const [imageUrl, setImageUrl] = createSignal(null);
  const [loading, setLoading] = createSignal(true);

  let previousObjectUrl = null;

  createEffect(async () => {
    // Track dependencies that should trigger re-fetch
    const src = props.src;
    const gateways = app.activeIpfsGateways();

    setLoading(true);

    // Revoke previous object URL to prevent memory leaks
    if (previousObjectUrl && previousObjectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previousObjectUrl);
      previousObjectUrl = null;
    }

    if (!src || gateways.length === 0) {
      setImageUrl(null);
      setLoading(false);
      return;
    }

    try {
      const { res, url, decrypted } = await fetchBestWithDecryption(app, src, { postGateways: props.postGateways });

      // If the content was decrypted, create an object URL from the blob
      if (decrypted) {
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        previousObjectUrl = objectUrl;
        setImageUrl(objectUrl);
      } else {
        // Not encrypted, use the URL directly
        setImageUrl(url);
      }
    } catch (e) {
      // Fallback silently on any error, but keep the log for debugging.
      console.error(`[IpfsImage] All gateways failed for ${src}:`, e.causes || e);
      setImageUrl(null);
    } finally {
      setLoading(false);
    }
  });

  // Cleanup object URLs on unmount
  onCleanup(() => {
    if (previousObjectUrl && previousObjectUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previousObjectUrl);
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
