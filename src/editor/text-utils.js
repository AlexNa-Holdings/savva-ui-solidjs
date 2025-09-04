// src/x/editor/text-utils.js

/**
 * Inserts a given string of text at the current cursor position in a textarea.
 * @param {HTMLTextAreaElement} textarea - The textarea element.
 * @param {string} text - The text to insert.
 * @param {function(string): void} onUpdate - Callback to update the signal holding the textarea's value.
 */
export function insertTextAtCursor(textarea, text, onUpdate) {
  if (!textarea || !text) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const fullText = textarea.value;

  const newText = fullText.substring(0, start) + text + fullText.substring(end);
  onUpdate(newText);

  requestAnimationFrame(() => {
    textarea.focus();
    const newCursorPos = start + text.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
  });
}


/**
 * Applies markdown formatting to the selected text in a textarea.
 * @param {HTMLTextAreaElement} textarea - The textarea element.
 * @param {'bold' | 'italic' | 'link' | 'image'} format - The markdown format to apply.
 * @param {function(string): void} onUpdate - Callback to update the signal holding the textarea's value.
 */
export function applyMarkdownFormat(textarea, format, onUpdate) {
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  const fullText = textarea.value;

  let replacement;
  let prefix, suffix, placeholder;

  // Special handling for 'image' format
  if (format === 'image') {
    replacement = `![alt text](${selectedText || 'image_url'})`;
  } else {
    // Standard handling for other formats
    switch (format) {
      case 'bold':
        prefix = '**';
        suffix = '**';
        placeholder = 'bold text';
        break;
      case 'italic':
        prefix = '*';
        suffix = '*';
        placeholder = 'italic text';
        break;
      case 'link':
        prefix = '[';
        suffix = '](url)';
        placeholder = 'link text';
        break;
      default:
        return;
    }
    const textToWrap = selectedText || placeholder;
    replacement = prefix + textToWrap + suffix;
  }
  
  textarea.focus();
  textarea.setSelectionRange(start, end);

  const success = document.execCommand('insertText', false, replacement);

  if (!success) {
    const newText = fullText.substring(0, start) + replacement + fullText.substring(end);
    onUpdate(newText);
  }

  requestAnimationFrame(() => {
    textarea.focus();
    
    if (format === 'image') {
      if (selectedText) {
        const altTextStart = start + '!['.length;
        const altTextEnd = altTextStart + 'alt text'.length;
        textarea.setSelectionRange(altTextStart, altTextEnd);
      } else {
        const urlStart = start + '![alt text]('.length;
        const urlEnd = urlStart + 'image_url'.length;
        textarea.setSelectionRange(urlStart, urlEnd);
      }
    } else {
      if (selectedText) {
        textarea.setSelectionRange(start, start + replacement.length);
      } else {
        const cursorPosStart = start + prefix.length;
        const cursorPosEnd = cursorPosStart + placeholder.length;
        textarea.setSelectionRange(cursorPosStart, cursorPosEnd);
      }
    }
  });
}