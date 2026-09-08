"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";

// Three options, not two.
//
// A two-state toggle silently makes a decision for the visitor the first
// time they touch it: whatever the OS said is thrown away and never comes
// back. "System" has to stay reachable, because most people want the site
// to follow their phone's night mode and only override it occasionally.
//
// Rendered as a real radio group rather than a button that cycles. A cycle
// button cannot say what the current state is without being pressed, which
// is poor for a screen reader and worse for anyone who cannot see the
// colours change — the very people most likely to have a strong theme
// preference.

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
  { value: "system", label: "System", icon: "◐" },
];

// The applied theme is the data-theme attribute on <html> — set by
// ThemeScript before first paint, and by this component thereafter. That
// attribute is the single source of truth, so this reads it rather than
// keeping a second copy in React state that could disagree with what the
// page is actually painted in.
//
// useSyncExternalStore rather than useState + useEffect: the value lives
// outside React (in the DOM and in localStorage), it does not exist during
// SSR, and React needs to know that so hydration is correct rather than
// merely quiet. It also makes cross-tab sync fall out for free.

const THEME_CHANGE_EVENT = "apnahealth:themechange";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  // Another tab changing the preference should be reflected here too.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Theme {
  const applied = document.documentElement.getAttribute("data-theme");
  return applied === "light" || applied === "dark" ? applied : "system";
}

// The server cannot know the visitor's choice — it lives in their browser.
// "system" is both the honest answer and the default the CSS already
// applies, so the server HTML is correct for a first-time visitor and
// corrected in place for everyone else.
function getServerSnapshot(): Theme {
  return "system";
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  // "system" is the ABSENCE of the attribute, which hands control back to
  // the prefers-color-scheme rules in globals.css.
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);

  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    // Private browsing, or storage blocked entirely. The theme still
    // applies for this page view; it just will not be remembered. Losing a
    // preference is not worth throwing an error into a clinic's console.
  }

  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <fieldset className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
      <legend className="sr-only">Colour theme</legend>
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <label
            key={option.value}
            // h-9 and a min width, not the h-7 this started as: on a
            // phone the label collapses to an icon, and a 28px target is
            // below what anyone can hit reliably. Matches the app's other
            // interactive controls.
            className={`flex h-9 min-w-9 cursor-pointer items-center justify-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-primary ${
              active ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={active}
              onChange={() => apply(option.value)}
              className="sr-only"
            />
            <span aria-hidden="true">{option.icon}</span>
            <span className="sr-only sm:not-sr-only">{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
