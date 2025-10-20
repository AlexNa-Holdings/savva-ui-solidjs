// src/docs/rehype-media-players.js
import { visit } from "unist-util-visit";

// const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/;
const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:(?:www|m)\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|mov)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a)$/i;

function isVideoUrl(url, altText = "") {
  return VIDEO_EXTENSIONS.test(url) || VIDEO_EXTENSIONS.test(altText);
}

function isAudioUrl(url, altText = "") {
  return AUDIO_EXTENSIONS.test(url) || AUDIO_EXTENSIONS.test(altText);
}

function getYouTubeId(url) {
  const match = url.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

function extractYouTubeParams(url) {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const params = new URLSearchParams(urlObj.search);

    // List of YouTube embed parameters we want to preserve
    const allowedParams = ['autoplay', 'mute', 'loop', 'controls', 'start', 'end', 'playlist', 'rel', 'modestbranding', 't'];
    const preservedParams = {};

    allowedParams.forEach(param => {
      if (params.has(param)) {
        preservedParams[param] = params.get(param);
      }
    });

    // Convert 't' parameter (watch URL format) to 'start' parameter (embed format)
    // Handle formats like: t=1s, t=1m30s, t=90, etc.
    if (preservedParams.t && !preservedParams.start) {
      const tValue = preservedParams.t;
      let seconds = 0;

      // Parse time format: e.g., "1m30s", "90s", "90"
      const minutesMatch = tValue.match(/(\d+)m/);
      const secondsMatch = tValue.match(/(\d+)s/);
      const plainNumber = tValue.match(/^(\d+)$/);

      if (minutesMatch) seconds += parseInt(minutesMatch[1]) * 60;
      if (secondsMatch) seconds += parseInt(secondsMatch[1]);
      if (plainNumber) seconds = parseInt(plainNumber[1]);

      preservedParams.start = String(seconds);
      delete preservedParams.t; // Remove 't' as we've converted it to 'start'
    }

    return preservedParams;
  } catch {
    return {};
  }
}

export function rehypeMediaPlayers() {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "img" || !node.properties?.src) {
        return;
      }

      const url = node.properties.src;
      const alt = node.properties.alt;
      const youtubeId = getYouTubeId(url);

      if (youtubeId) {
        // Extract and preserve YouTube parameters from the original URL
        const params = extractYouTubeParams(url);

        // Browser autoplay policy: autoplay only works with muted videos
        // Automatically add mute=1 when autoplay=1 is present but mute is not specified
        if (params.autoplay && !params.mute) {
          params.mute = '1';
        }

        const queryString = Object.keys(params).length > 0
          ? '?' + Object.entries(params).map(([key, value]) => `${key}=${value}`).join('&')
          : '';

        node.tagName = "div";
        node.properties = {
          className: "youtube-container",
          style: "position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%;"
        };
        node.children = [{
          type: "element",
          tagName: "iframe",
          properties: {
            src: `https://www.youtube.com/embed/${youtubeId}${queryString}`,
            frameborder: "0",
            allow: "autoplay; encrypted-media",
            allowfullscreen: true,
            style: "position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
          },
          children: []
        }];
      } else if (isVideoUrl(url, alt)) {
        node.tagName = "video";
        node.properties = {
          src: url,
          controls: true,
          style: "width: 100%; border-radius: 0.5rem;"
        };
        node.children = [];
      } else if (isAudioUrl(url, alt)) {
        node.tagName = "audio";
        node.properties = {
          src: url,
          controls: true,
          style: "width: 100%;"
        };
        node.children = [];
      }
    });
    return tree;
  };
}