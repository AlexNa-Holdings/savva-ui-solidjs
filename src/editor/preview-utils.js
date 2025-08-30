// src/editor/preview-utils.js

const PREVIEW_LENGTH = 512;

/**
 * Creates a plain-text preview for posts, stripping all Markdown.
 * @param {string} markdownText - The input Markdown string.
 * @returns {string} A plain-text preview.
 */
function createPostPreview(markdownText) {
  if (!markdownText) return "";

  let plainText = markdownText
    .replace(/^#+\s+/gm, '') // Headers
    .replace(/!\[(.*?)\]\(.*?\)/g, '$1') // Images, keeping alt text
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links, keeping link text
    .replace(/(\*\*|__|\*|_|~~)(.*?)\1/g, '$2') // Bold, italic, strikethrough
    .replace(/`([^`]+)`/g, '$1') // Inline code
    .replace(/^\>\s+/gm, '') // Blockquotes
    .replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '') // Horizontal rules
    .replace(/^\s*[-*+]\s+/gm, '') // List markers
    .replace(/^\s*\d+\.\s+/gm, '') // Numbered list markers
    .replace(/\s+/g, ' ') // Collapse multiple whitespace
    .trim();

  if (plainText.length > PREVIEW_LENGTH) {
    plainText = plainText.substring(0, PREVIEW_LENGTH).trim() + '...';
  }

  return plainText;
}

/**
 * Creates a preview for comments, preserving Markdown but truncating intelligently.
 * It avoids cutting inside a Markdown tag.
 * @param {string} markdownText - The input Markdown string.
 * @returns {string} A truncated Markdown preview.
 */
function createCommentPreview(markdownText) {
  if (!markdownText) return "";
  if (markdownText.length <= PREVIEW_LENGTH) {
    return markdownText;
  }

  // Tokenizes markdown into whole tags, code blocks, links, words, and whitespace.
  const tokenRegex = /(\[.*?\]\(.*?\)|!\[.*?\]\(.*?\)|`[^`]+`|\*\*.*?\*\*|__.*?__|~~.*?~~|\*.*?\*|_.*?_|\s+|[^\s]+)/g;
  const tokens = markdownText.match(tokenRegex) || [];
  
  let result = "";
  for (const token of tokens) {
    if ((result + token).length > PREVIEW_LENGTH) {
      break;
    }
    result += token;
  }

  // Trim trailing whitespace and add ellipsis if truncated
  result = result.trim();
  if (result.length < markdownText.length) {
    result += "...";
  }

  return result;
}

/**
 * Creates a text preview from Markdown content.
 * The behavior depends on the type ('post' or 'comment').
 * @param {string} markdownText - The input Markdown string.
 * @param {'post' | 'comment'} [type='post'] - The type of content.
 * @returns {string} A text preview.
 */
export function createTextPreview(markdownText, type = 'post') {
  if (type === 'comment') {
    return createCommentPreview(markdownText);
  }
  return createPostPreview(markdownText);
}