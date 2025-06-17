// This script runs on the Booking.com page
console.log('Booking.com AI Assistant is active');
console.log('Content script loaded');

// You can add additional functionality here that needs to interact with the page
// For example, you could add event listeners or modify the page content 

// Function to inject the popup HTML
function injectPopup() {
  // Check if popup already exists
  if (document.getElementById('booking-ai-popup')) {
    console.log('Popup already exists, skipping injection');
    return;
  }

  console.log('Attempting to inject popup');
  try {
    const popupContainer = document.createElement('div');
    popupContainer.id = 'booking-ai-popup-container';
    popupContainer.innerHTML = `
      <div id="booking-ai-popup">
        <div class="header">
          <h1>AI Assistant</h1>
          <button id="close-popup" class="close-button">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div class="content">
          <div class="message">
            <p>Hello! I'm your AI assistant. How can I help you with your booking?</p>
          </div>
        </div>

        <div class="footer">
          <button id="screenshotBtn" class="screenshot-button">
            Take Screenshot
          </button>
        </div>
      </div>
    `;

    // Use a more reliable way to append to the body
    const body = document.body || document.getElementsByTagName('body')[0];
    if (body) {
      body.appendChild(popupContainer);
      console.log('Popup injected into DOM');

      // Add event listeners
      const closeButton = document.getElementById('close-popup');
      const screenshotBtn = document.getElementById('screenshotBtn');
      const popup = document.getElementById('booking-ai-popup');

      console.log('Popup elements:', { closeButton, screenshotBtn, popup });

      if (closeButton) {
        closeButton.addEventListener('click', () => {
          if (popup) {
            popup.style.display = 'none';
          }
        });
      }

      if (screenshotBtn) {
        screenshotBtn.addEventListener('click', async () => {
          console.log('Screenshot button clicked');
          try {
            // Send message to background script
            console.log('Sending screenshot request to background script');
            const response = await chrome.runtime.sendMessage({ action: 'takeScreenshot' });
            console.log('Received response from background script:', response);

            if (response && response.screenshot) {
              console.log('Creating download link for screenshot');
              const link = document.createElement('a');
              link.href = response.screenshot;
              link.download = `booking-screenshot-${new Date().toISOString()}.png`;
              link.click();
              console.log('Screenshot download initiated');
            } else {
              console.error('No screenshot data received from background script');
            }
          } catch (error: unknown) {
            console.error('Error taking screenshot:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to take screenshot';
            const errorElement = document.createElement('div');
            errorElement.textContent = errorMessage;
            errorElement.style.color = 'red';
            errorElement.style.padding = '10px';
            const content = document.querySelector('.content');
            if (content) {
              content.appendChild(errorElement);
            }
          }
        });
      }
    } else {
      console.error('Could not find body element');
    }
  } catch (error) {
    console.error('Error injecting popup:', error);
  }
}

// Function to ensure the page is ready
function ensurePageReady() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOM Content Loaded, injecting popup');
      injectPopup();
    });
  } else {
    console.log('Document already loaded, injecting popup immediately');
    injectPopup();
  }
}

// Start the injection process
ensurePageReady(); 