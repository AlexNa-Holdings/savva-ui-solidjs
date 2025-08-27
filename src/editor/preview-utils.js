// src/editor/preview-utils.js

const PREVIEW_LENGTH = 265;

/**
 * Creates a plain-text preview from Markdown content.
 * It strips Markdown syntax and truncates the text.
 * @param {string} markdownText - The input Markdown string.
 * @returns {string} A plain-text preview.
 */
export function createTextPreview(markdownText) {
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