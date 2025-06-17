console.log('Popup script loaded');

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded');
  
  const screenshotBtn = document.getElementById('screenshotBtn');
  console.log('Screenshot button:', screenshotBtn);

  if (screenshotBtn) {
    screenshotBtn.addEventListener('click', async () => {
      console.log('Screenshot button clicked');
      try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('Active tab:', tab);
        
        if (tab.id) {
          // Take a screenshot of the entire page
          const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
            format: 'png'
          });
          console.log('Screenshot taken');

          // Create a download link
          const link = document.createElement('a');
          link.href = screenshot;
          link.download = `booking-screenshot-${new Date().toISOString()}.png`;
          link.click();
          console.log('Screenshot downloaded');
        }
      } catch (error) {
        console.error('Error taking screenshot:', error);
      }
    });
  }
}); 