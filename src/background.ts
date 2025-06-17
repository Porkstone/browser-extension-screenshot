console.log('Background script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message in background script:', request);
  
  if (request.action === 'takeScreenshot') {
    console.log('Taking screenshot...');
    
    // Get the current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.captureVisibleTab(tabs[0].windowId, { format: 'png' })
          .then(screenshot => {
            console.log('Screenshot taken successfully');
            sendResponse({ screenshot });
          })
          .catch(error => {
            console.error('Error taking screenshot:', error);
            sendResponse({ error: error.message });
          });
      } else {
        console.error('No active tab found');
        sendResponse({ error: 'No active tab found' });
      }
    });
    
    return true; // Required for async sendResponse
  }
}); 