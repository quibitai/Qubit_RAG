import { useEffect, useRef, type RefObject } from 'react';

export function useScrollToBottom<T extends HTMLElement>(): [
  RefObject<T>,
  RefObject<T>,
] {
  const containerRef = useRef<T>(null);
  const endRef = useRef<T>(null);
  const userScrolledUpRef = useRef(false);
  const lastScrollTopRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    const end = endRef.current;

    if (container && end) {
      // Track if user has scrolled up
      const handleScroll = () => {
        if (!container) return;

        const currentScrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;

        // Check if user is near bottom (within 150px) - increased threshold for better UX
        const isNearBottom =
          scrollHeight - currentScrollTop - clientHeight < 150;

        // Check if user scrolled up manually (not just content being added)
        const scrolledUp = currentScrollTop < lastScrollTopRef.current - 10; // 10px threshold to avoid tiny movements

        if (scrolledUp) {
          userScrolledUpRef.current = true;
        } else if (isNearBottom) {
          // Reset the flag if user scrolls back near bottom
          userScrolledUpRef.current = false;
        }

        lastScrollTopRef.current = currentScrollTop;
      };

      // Add scroll event listener to detect manual scrolling
      container.addEventListener('scroll', handleScroll, { passive: true });

      const observer = new MutationObserver(() => {
        // Only auto-scroll if user hasn't manually scrolled up AND is near bottom
        const isNearBottom =
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
          150;

        if (!userScrolledUpRef.current || isNearBottom) {
          // Use requestAnimationFrame for smoother scrolling
          requestAnimationFrame(() => {
            if (end && container) {
              end.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
          });
        }
      });

      observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      return () => {
        observer.disconnect();
        container.removeEventListener('scroll', handleScroll);
      };
    }
  }, []);

  return [containerRef, endRef];
}
