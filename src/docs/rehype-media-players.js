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
        node.tagName = "div";
        node.properties = {
          className: "youtube-container",
          style: "position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%;"
        };
        node.children = [{
          type: "element",
          tagName: "iframe",
          properties: {
            src: `https://www.youtube.com/embed/${youtubeId}`,
            frameborder: "0",
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