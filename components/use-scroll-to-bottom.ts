import { useEffect, useRef, type RefObject } from 'react';

export function useScrollToBottom<T extends HTMLElement>(): [
  RefObject<T>,
  RefObject<T>,
] {
  const containerRef = useRef<T>(null);
  const endRef = useRef<T>(null);
  const userHasScrolledRef = useRef(false);
  const isAutoScrollingRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const end = endRef.current;

    if (!container || !end) return;

    // Function to scroll to bottom
    const scrollToBottom = () => {
      if (isAutoScrollingRef.current) return;

      isAutoScrollingRef.current = true;
      container.scrollTop = container.scrollHeight;

      // Reset flag after scroll completes
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 100);
    };

    // Track user scrolling
    const handleScroll = () => {
      if (isAutoScrollingRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;

      // If user scrolls up from bottom, mark as manually scrolled
      if (!isAtBottom && !userHasScrolledRef.current) {
        userHasScrolledRef.current = true;
      }

      // If user scrolls back to bottom, reset the flag
      if (isAtBottom && userHasScrolledRef.current) {
        userHasScrolledRef.current = false;
      }
    };

    // Auto-scroll when content changes
    const observer = new MutationObserver(() => {
      // Only auto-scroll if user hasn't manually scrolled up
      if (!userHasScrolledRef.current) {
        scrollToBottom();
      }
    });

    // Set up event listeners and observer
    container.addEventListener('scroll', handleScroll, { passive: true });
    observer.observe(container, {
      childList: true,
      subtree: true,
    });

    // Initial scroll to bottom
    scrollToBottom();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, []);

  return [containerRef, endRef];
}
