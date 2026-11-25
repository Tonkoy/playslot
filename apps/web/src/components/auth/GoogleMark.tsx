'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The Google "G" on the sign-in button. Google's branding rules ask for their
 * own, unmodified mark, so it is a file rather than something drawn here:
 * save the official SVG as `public/brand/google-g.svg`. Until that file
 * exists this renders nothing and the button is text-only, as before.
 */
export function GoogleMark() {
  const ref = useRef<HTMLImageElement>(null);
  const [missing, setMissing] = useState(false);

  // A load error that happened before hydration never reaches onError.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setMissing(true);
  }, []);

  if (missing) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an 18px static SVG gains nothing from next/image
    <img
      ref={ref}
      src="/brand/google-g.svg"
      alt=""
      width={18}
      height={18}
      onError={() => setMissing(true)}
      style={{ display: 'block', flex: 'none' }}
    />
  );
}
