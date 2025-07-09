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
        console.log(`Starting full page screenshot: ${totalScreenshotsVertical}x${totalScreenshotsHorizontal} screenshots`);
        
        for (let y = 0; y < totalScreenshotsVertical; y++) {
          for (let x = 0; x < totalScreenshotsHorizontal; x++) {
            console.log(`Capturing screenshot ${y * totalScreenshotsHorizontal + x + 1}/${totalScreenshotsVertical * totalScreenshotsHorizontal} at position (${x}, ${y})`);
            
            // Scroll to position with longer timeout for Windows
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                console.log('Scroll timeout reached, continuing anyway');
                resolve(null);
              }, 1000); // Increased timeout for Windows
              
              chrome.tabs.sendMessage(tabId, {
                action: 'scrollToPosition',
                x: x * viewportWidth,
                y: y * viewportHeight
              }, (response) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) {
                  console.warn('Scroll message error:', chrome.runtime.lastError);
                }
                setTimeout(resolve, 600); // Increased wait time for Windows
              });
            });
            
            // Wait longer for dynamic content on Windows
            await new Promise(res => setTimeout(res, 400)); // Increased from 200ms
            
            // Capture screenshot with retry logic
            let screenshot = null;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (!screenshot && retryCount < maxRetries) {
              try {
                screenshot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
                console.log(`Screenshot captured successfully (attempt ${retryCount + 1})`);
              } catch (error) {
                retryCount++;
                console.warn(`Screenshot attempt ${retryCount} failed:`, error);
                if (retryCount < maxRetries) {
                  await new Promise(res => setTimeout(res, 500)); // Wait before retry
                } else {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  throw new Error(`Failed to capture screenshot after ${maxRetries} attempts: ${errorMessage}`);
                }
              }
            }
            
            if (screenshot) {
              screenshots.push(screenshot);
            } else {
              throw new Error(`Failed to capture screenshot at position (${x}, ${y})`);
            }
          }
        }
        
        console.log(`Successfully captured ${screenshots.length} screenshots`);
        sendResponse({ screenshots });
      } catch (error) {
        console.error('Full page screenshot error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        sendResponse({ 
          error: `Failed to capture full page screenshot: ${errorMessage}`,
          details: {
            totalScreenshots: totalScreenshotsVertical * totalScreenshotsHorizontal,
            capturedScreenshots: screenshots.length,
            viewportSize: { width: viewportWidth, height: viewportHeight },
            gridSize: { vertical: totalScreenshotsVertical, horizontal: totalScreenshotsHorizontal }
          }
        });
      }
    })();
    return true;
  }

  if (request.action === 'takeScreenshot') {
    console.log('Taking single screenshot...');
    
    // Get the current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.captureVisibleTab(tabs[0].windowId, { format: 'png' })
          .then(screenshot => {
            console.log('Single screenshot taken successfully');
            sendResponse({ screenshot });
          })
          .catch(error => {
            console.error('Error taking single screenshot:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            sendResponse({ 
              error: `Failed to capture screenshot: ${errorMessage}`,
              details: { tabId: tabs[0].id, windowId: tabs[0].windowId }
            });
          });
      } else {
        console.error('No active tab found');
        sendResponse({ error: 'No active tab found' });
      }
    });
    
    return true; // Required for async sendResponse
  }
}); 