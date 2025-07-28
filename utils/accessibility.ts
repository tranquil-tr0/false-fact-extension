/**
 * Accessibility utilities for keyboard navigation and screen reader support
 */

/**
 * Announce a message to screen readers using the #screen-reader-announcer div.
 * @param message The message to announce
 * @param politeness The politeness level: "polite" (default) or "assertive"
 */
export function announceMessage(
  message: string,
  politeness: "polite" | "assertive" = "polite"
): void {
  const announcer = document.getElementById("screen-reader-announcer");
  if (!announcer) return;
  announcer.setAttribute("aria-live", politeness);
  announcer.textContent = "";
  setTimeout(() => {
    announcer.textContent = message;
  }, 10);
}

/**
 * Keyboard shortcut definitions
 */
export interface KeyboardShortcut {
  key: string;
  description: string;
  action: () => void;
  modifier?: "alt" | "ctrl" | "shift" | "meta";
}

/**
 * Register keyboard shortcuts for the extension
 * @param shortcuts Array of keyboard shortcuts to register
 */
export function registerKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void {
  document.addEventListener("keydown", (event) => {
    for (const shortcut of shortcuts) {
      const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
      let modifierMatch = true;

      if (shortcut.modifier) {
        switch (shortcut.modifier) {
          case "alt":
            modifierMatch = event.altKey;
            break;
          case "ctrl":
            modifierMatch = event.ctrlKey;
            break;
          case "shift":
            modifierMatch = event.shiftKey;
            break;
          case "meta":
            modifierMatch = event.metaKey;
            break;
        }
      }

      if (keyMatch && modifierMatch) {
        event.preventDefault();
        shortcut.action();
        return;
      }
    }
  });
}

/**
 * Create a keyboard shortcuts help dialog
 * @param shortcuts Array of keyboard shortcuts to display
 * @returns HTMLElement containing the shortcuts help dialog
 */
export function createKeyboardShortcutsHelp(
  shortcuts: KeyboardShortcut[]
): HTMLElement {
  const helpDialog = document.createElement("div");
  helpDialog.className = "keyboard-shortcuts-help";
  helpDialog.setAttribute("role", "dialog");
  helpDialog.setAttribute("aria-labelledby", "keyboard-shortcuts-title");

  let helpContent = `
    <div class="shortcuts-header">
      <h3 id="keyboard-shortcuts-title">Keyboard Shortcuts</h3>
      <button class="close-shortcuts" aria-label="Close keyboard shortcuts help">×</button>
    </div>
    <div class="shortcuts-content">
      <table class="shortcuts-table">
        <thead>
          <tr>
            <th>Shortcut</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
  `;

  shortcuts.forEach((shortcut) => {
    const modifierText = shortcut.modifier
      ? `${shortcut.modifier.toUpperCase()} + `
      : "";
    helpContent += `
      <tr>
        <td class="shortcut-key">${modifierText}${shortcut.key.toUpperCase()}</td>
        <td class="shortcut-description">${shortcut.description}</td>
      </tr>
    `;
  });

  helpContent += `
        </tbody>
      </table>
    </div>
  `;

  helpDialog.innerHTML = helpContent;

  // Add close button functionality
  const closeButton = helpDialog.querySelector(".close-shortcuts");
  if (closeButton) {
    closeButton.addEventListener("click", () => {
      helpDialog.remove();
    });
  }

  // Close on escape key
  helpDialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      helpDialog.remove();
    }
  });

  return helpDialog;
}

/**
 * Show keyboard shortcuts help dialog
 * @param shortcuts Array of keyboard shortcuts to display
 */
export function showKeyboardShortcutsHelp(shortcuts: KeyboardShortcut[]): void {
  // Remove any existing help dialog
  const existingDialog = document.querySelector(".keyboard-shortcuts-help");
  if (existingDialog) {
    existingDialog.remove();
  }

  const helpDialog = createKeyboardShortcutsHelp(shortcuts);
  document.body.appendChild(helpDialog);

  // Focus the dialog for keyboard users
  helpDialog.setAttribute("tabindex", "-1");
  helpDialog.focus();
}

/**
 * Create a skip link for keyboard navigation
 * @param targetId ID of the element to skip to
 * @param text Text for the skip link
 * @returns HTMLElement containing the skip link
 */
export function createSkipLink(
  targetId: string,
  text: string = "Skip to content"
): HTMLElement {
  const skipLink = document.createElement("a");
  skipLink.href = `#${targetId}`;
  skipLink.className = "skip-to-content";
  skipLink.textContent = text;

  skipLink.addEventListener("click", (event) => {
    event.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.setAttribute("tabindex", "-1");
      target.focus();
    }
  });

  return skipLink;
}

/**
 * Add focus trap to a modal dialog
 * @param dialogElement The dialog element to trap focus within
 * @returns Function to remove the focus trap
 */
export function addFocusTrap(dialogElement: HTMLElement): () => void {
  const focusableElements = dialogElement.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  const firstElement = focusableElements[0] as HTMLElement;
  const lastElement = focusableElements[
    focusableElements.length - 1
  ] as HTMLElement;

  const handleTabKey = (event: KeyboardEvent) => {
    if (event.key === "Tab") {
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  };

  dialogElement.addEventListener("keydown", handleTabKey);

  // Focus the first element when the trap is added
  if (firstElement) {
    firstElement.focus();
  }

  // Return function to remove the trap
  return () => {
    dialogElement.removeEventListener("keydown", handleTabKey);
  };
}

/**
 * Check if high contrast mode is active
 * @returns Boolean indicating if high contrast mode is active
 */
export function isHighContrastModeActive(): boolean {
  // Check for forced-colors media query support
  if (window.matchMedia("(forced-colors: active)").matches) {
    return true;
  }

  // Fallback detection for older browsers
  // Create a test element with transparent border
  const testElement = document.createElement("div");
  testElement.style.borderColor = "transparent";
  testElement.style.position = "absolute";
  testElement.style.width = "1px";
  testElement.style.height = "1px";
  document.body.appendChild(testElement);

  // Get the computed style
  const computedStyle = window.getComputedStyle(testElement);
  const borderColor = computedStyle.borderColor || computedStyle.borderTopColor;

  // Clean up
  document.body.removeChild(testElement);

  // In high contrast mode, 'transparent' is often overridden
  return borderColor !== "transparent" && borderColor !== "rgba(0, 0, 0, 0)";
}

/**
 * Apply high contrast mode enhancements
 */
export function enhanceForHighContrast(): void {
  if (isHighContrastModeActive()) {
    document.body.classList.add("high-contrast-mode");

    // Add patterns to distinguish different elements
    const factSegments = document.querySelectorAll(
      ".fact-segment, .category-fill.fact"
    );
    const opinionSegments = document.querySelectorAll(
      ".opinion-segment, .category-fill.opinion"
    );
    const falseSegments = document.querySelectorAll(
      ".false-segment, .category-fill.false"
    );

    factSegments.forEach((element) => {
      (element as HTMLElement).style.backgroundImage =
        "linear-gradient(45deg, currentColor 25%, transparent 25%, transparent 50%, currentColor 50%, currentColor 75%, transparent 75%, transparent)";
      (element as HTMLElement).style.backgroundSize = "10px 10px";
    });

    opinionSegments.forEach((element) => {
      (element as HTMLElement).style.backgroundImage =
        "linear-gradient(90deg, currentColor 50%, transparent 50%)";
      (element as HTMLElement).style.backgroundSize = "10px 10px";
    });

    falseSegments.forEach((element) => {
      (element as HTMLElement).style.backgroundImage =
        "linear-gradient(135deg, currentColor 25%, transparent 25%, transparent 50%, currentColor 50%, currentColor 75%, transparent 75%, transparent)";
      (element as HTMLElement).style.backgroundSize = "10px 10px";
    });
  }
}
