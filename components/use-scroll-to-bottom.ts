import { useEffect, useRef, type RefObject } from 'react';

export function useScrollToBottom<T extends HTMLElement>(): [
  RefObject<T>,
  RefObject<T>,
] {
  const containerRef = useRef<T>(null);
  const endRef = useRef<T>(null);
  const userScrolledUpRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    const end = endRef.current;

    if (container && end) {
      // Track if user has scrolled up
      const handleScroll = () => {
        if (!container) return;

        // Check if user is near bottom (within 100px) or has scrolled up
        const isAtBottom =
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
          100;

        userScrolledUpRef.current = !isAtBottom;
      };

      // Add scroll event listener to detect manual scrolling
      container.addEventListener('scroll', handleScroll);

      const observer = new MutationObserver(() => {
        // Only auto-scroll if user hasn't manually scrolled up
        if (!userScrolledUpRef.current) {
          end.scrollIntoView({ behavior: 'instant', block: 'end' });
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
