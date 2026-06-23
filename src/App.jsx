import { useEffect, useRef } from 'react';
import { legacyMarkup } from './legacyMarkup.js';

export default function App() {
  const containerRef = useRef(null);

  useEffect(() => {
    // Load the original POS stylesheet from /public/style.css
    let styleLink = document.querySelector('link[data-pos-style="true"]');
    if (!styleLink) {
      styleLink = document.createElement('link');
      styleLink.rel = 'stylesheet';
      styleLink.href = '/style.css';
      styleLink.dataset.posStyle = 'true';
      document.head.appendChild(styleLink);
    }

    // Render the recovered POS HTML from legacyMarkup.js
    if (containerRef.current) {
      containerRef.current.innerHTML = legacyMarkup;
    }

    // Scripts inserted through innerHTML do not execute, so load script.js manually.
    const oldScript = document.querySelector('script[data-pos-script="true"]');
    if (oldScript) oldScript.remove();

    const script = document.createElement('script');
    script.src = '/script.js?v=restored-pos';
    script.async = false;
    script.dataset.posScript = 'true';
    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return <div ref={containerRef} />;
}
