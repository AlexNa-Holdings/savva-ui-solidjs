import { createSignal, onMount } from "solid-js";
import { parse } from "yaml";

export function useConnect() {
  const [config, setConfig] = createSignal(null);
  const [info, setInfo] = createSignal(null);
  const [error, setError] = createSignal(null);
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    try {
      const res = await fetch("/default_connect.yaml", { cache: "no-store" });
      if (!res.ok) throw new Error(`YAML load failed: ${res.status}`);
      const text = await res.text();
      const data = parse(text);
      if (!data.backendLink) throw new Error("Missing backendLink in config");

      const backend = data.backendLink.endsWith("/")
        ? data.backendLink
        : data.backendLink + "/";

      const cfg = {
        domain: data.domain || "",
        backendLink: backend,
        default_ipfs_link: data.default_ipfs_link || ""
      };
      setConfig(cfg);

      const infoRes = await fetch(cfg.backendLink + "info");
      if (!infoRes.ok) throw new Error(`/info failed: ${infoRes.status}`);
      setInfo(await infoRes.json());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  });

  return { config, info, error, loading };
}
