import { useRef, useState } from "react";

/**
 * Simple drag-to-refresh for touch screens. Only starts when the page is scrolled
 * to the top, so normal scrolling is unaffected. Spread `bind` onto the scroll container.
 */
export function usePullToRefresh(onRefresh: any, { threshold = 70, maxPull = 110 } = {}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const distance = useRef(0);

  const onTouchStart = (event: any) => {
    if (refreshing || window.scrollY > 0) return;
    startY.current = event.touches[0].clientY;
  };

  const onTouchMove = (event: any) => {
    if (startY.current === null) return;
    const dy = event.touches[0].clientY - startY.current;
    // Resist the drag so it feels like pulling against weight.
    distance.current = dy > 0 ? Math.min(dy * 0.5, maxPull) : 0;
    setPull(distance.current);
  };

  const onTouchEnd = async () => {
    if (startY.current === null) return;
    startY.current = null;
    const shouldRefresh = distance.current >= threshold;
    distance.current = 0;
    setPull(0);
    if (!shouldRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return {
    pull,
    refreshing,
    bind: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
    },
  };
}
