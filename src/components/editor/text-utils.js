// src/components/editor/text-utils.js

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

  // Use document.execCommand to insert the text. This is treated as a user
  // action by the browser and is added to the undo/redo stack.
  const success = document.execCommand('insertText', false, replacement);

  // If execCommand fails for any reason, fall back to the direct update method.
  if (!success) {
    const newText = fullText.substring(0, start) + replacement + fullText.substring(end);
    onUpdate(newText);
  }

  // After the state updates, re-focus and set the cursor position.
  requestAnimationFrame(() => {
    textarea.focus();
    
    if (format === 'image') {
      if (selectedText) {
        // If text was selected for the URL, select the placeholder alt text for editing.
        const altTextStart = start + '!['.length;
        const altTextEnd = altTextStart + 'alt text'.length;
        textarea.setSelectionRange(altTextStart, altTextEnd);
      } else {
        // If no text was selected, select the placeholder URL.
        const urlStart = start + '![alt text]('.length;
        const urlEnd = urlStart + 'image_url'.length;
        textarea.setSelectionRange(urlStart, urlEnd);
      }
    } else {
      // Standard selection logic for other formats
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
