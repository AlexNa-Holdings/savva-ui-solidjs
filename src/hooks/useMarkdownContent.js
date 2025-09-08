// src/hooks/useMarkdownContent.js
import { createMemo, createResource } from "solid-js";
import { ipfs } from "../ipfs/index.js";
import { parse } from "yaml";
import { dbg } from "../utils/debug.js";
import { getPostContentBaseCid, getPostDescriptorPath } from "../ipfs/utils.js";
import { rehypeRewriteLinks } from "../docs/rehype-rewrite-links.js";
import { fetchDescriptorWithFallback } from "../ipfs/fetchDescriptorWithFallback.js";


async function fetchDetails(app, contentObject) {
  if (!contentObject) return null;

  const descriptorPath = getPostDescriptorPath(contentObject);
  const dataCidForContent = getPostContentBaseCid(contentObject);
  if (!descriptorPath) return { descriptor: null, dataCidForContent };

  try {
    const { text, finalPath, usedFallback } = await fetchDescriptorWithFallback(
      app,
      contentObject,
      (path) => ipfs.fetchBest(app, path).then((x) => x.res)
    );
    dbg.log("useMarkdownContent", "descriptor loaded", { finalPath, usedFallback });

    const descriptor = parse(text) || null;
    return { descriptor, dataCidForContent };
  } catch (error) {
    dbg.error("useMarkdownContent", "Failed to fetch descriptor", { path: descriptorPath, error });
    return { descriptor: { error: error.message }, dataCidForContent };
  }
}

async function fetchContent(params) {
  const { details, app, lang, chapterIndex } = params;
  if (!details?.descriptor || !lang) return "";

  const { descriptor, dataCidForContent } = details;
  const localized = descriptor.locales?.[lang] || descriptor.locales?.en || Object.values(descriptor.locales || {})[0];
  if (!localized) return "";

  let contentPath;
  if (chapterIndex === 0) {
    if (localized.data) return localized.data;
    if (localized.data_path) contentPath = `${dataCidForContent}/${localized.data_path}`;
  } else {
    const chapter = localized.chapters?.[chapterIndex - 1];
    if (chapter?.data_path) contentPath = `${dataCidForContent}/${chapter.data_path}`;
  }

  if (contentPath) {
    try {
      const { res } = await ipfs.fetchBest(app, contentPath, { postGateways: descriptor.gateways });
      return await res.text();
    } catch (error) {
      dbg.error('useMarkdownContent', 'Failed to fetch content', { path: contentPath, error });
      return `## Error loading content\n\n\`\`\`\n${error.message}\n\`\`\``;
    }
  }
  return "";
}

export function useMarkdownContent(props) {
  const [details] = createResource(() => props.contentObject(), (content) => fetchDetails(props.app, content));
  
  const [mainContent] = createResource(
    () => ({ details: details(), app: props.app, lang: props.lang(), chapterIndex: props.chapterIndex() }),
    fetchContent
  );

  const ipfsBaseUrl = createMemo(() => {
    const d = details();
    const dataCid = d?.dataCidForContent;
    if (!d || !dataCid) return "";
    
    const gateways = d.descriptor?.gateways || props.contentObject()?.gateways || [];
    let bestGateway;

    if (props.app.localIpfsEnabled() && props.app.localIpfsGateway()) {
      bestGateway = props.app.localIpfsGateway();
    } else if (gateways.length > 0) {
      bestGateway = gateways[0];
    } else {
      bestGateway = props.app.remoteIpfsGateways()[0] || "https://ipfs.io/";
    }
    
    return ipfs.buildUrl(bestGateway, dataCid);
  });

  const markdownPlugins = createMemo(() => [
    [rehypeRewriteLinks, { base: ipfsBaseUrl() }]
  ]);

  return { details, mainContent, markdownPlugins, ipfsBaseUrl };
}