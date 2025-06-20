console.log('Background script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message in background script:', request);
  
  if (request.action === 'takeFullPageScreenshot') {
    const { totalScreenshotsVertical, totalScreenshotsHorizontal, viewportWidth, viewportHeight } = request;
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (!tabId || !windowId) {
      sendResponse({ error: 'No tab ID or window ID' });
      return true;
    }
    (async () => {
      const screenshots: string[] = [];
      try {
        for (let y = 0; y < totalScreenshotsVertical; y++) {
          for (let x = 0; x < totalScreenshotsHorizontal; x++) {
            // Scroll to position
            await new Promise((resolve, reject) => {
              chrome.tabs.sendMessage(tabId, {
                action: 'scrollToPosition',
                x: x * viewportWidth,
                y: y * viewportHeight
              }, () => setTimeout(resolve, 400)); // Wait for scroll
            });
            // Wait a bit more for dynamic content
            await new Promise(res => setTimeout(res, 200));
            // Capture screenshot
            const screenshot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
            screenshots.push(screenshot);
          }
        }
        sendResponse({ screenshots });
      } catch (error) {
        sendResponse({ error: error instanceof Error ? error.message : 'Failed to capture screenshots' });
      }
    })();
    return true;
  }

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