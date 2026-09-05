import React, { useState, useEffect } from 'react';

/**
 * Smooth numerical count-up component from 0 to target value.
 * Extracted from Analyzer.tsx for reuse across the application.
 */
const AnimatedCounter: React.FC<{ value: number; duration?: number; suffix?: string }> = React.memo(({
  value,
  duration = 1100,
  suffix = '%'
}) => {
  const [displayValue, setDisplayValue] = useState<number>(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    let animationFrame: number;

    const step = (timestamp: number) => {
      if (startTimestamp === null) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);
      // Cubic ease-out deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(easeOut * value));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(step);
      }
    };

    animationFrame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return <span>{displayValue}{suffix}</span>;
});

AnimatedCounter.displayName = 'AnimatedCounter';

export default AnimatedCounter;
