/**
 * Native smooth scroll to a section element.
 * Uses browser-native smooth scroll into view, respecting CSS scroll-margin-top.
 * 
 * @param elementId ID of the DOM element to scroll to
 */
export function scrollToSection(elementId: string): void {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
