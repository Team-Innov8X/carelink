declare global {
  interface Window {
    google?: any;
    careLinkGoogleMapsPromise?: Promise<void>;
  }
}

/** Load the approved Maps JavaScript API once for all map and distance-matrix consumers. */
export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Maps requires a browser.'));
  if (window.google?.maps) return Promise.resolve();
  if (window.careLinkGoogleMapsPromise) return window.careLinkGoogleMapsPromise;

  window.careLinkGoogleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => (window.google?.maps ? resolve() : reject(new Error('Google Maps did not load.')));
    script.onerror = () => reject(new Error('Could not load Google Maps. Check the API key and billing setup.'));
    document.head.appendChild(script);
  });

  return window.careLinkGoogleMapsPromise;
}
