// Service worker registration
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
        })
        .catch(error => {
          console.error('ServiceWorker registration failed: ', error);
        });
    });
  }
}

// Setup offline detection
export function setupOfflineDetection() {
  const updateOnlineStatus = () => {
    const status = navigator.onLine ? 'online' : 'offline';
    console.log(`App is now ${status}`);
    
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('connectionStatusChange', { 
      detail: { online: navigator.onLine } 
    }));
  };
  
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  
  // Initial check
  updateOnlineStatus();
}