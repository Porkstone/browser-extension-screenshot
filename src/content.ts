// This script runs on the Booking.com page
console.log('Booking.com AI Assistant is active');
console.log('Content script loaded');

// You can add additional functionality here that needs to interact with the page
// For example, you could add event listeners or modify the page content 

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrollToPosition') {
    window.scrollTo(request.x, request.y);
    setTimeout(() => sendResponse({ status: 'scrolled' }), 300); // Give time for scroll
    return true;
  }
});

// Function to get page dimensions
function getPageDimensions() {
  const body = document.body;
  const html = document.documentElement;
  const width = Math.max(
    body.scrollWidth, body.offsetWidth,
    html.clientWidth, html.scrollWidth, html.offsetWidth
  );
  console.log('Page width:', width);
  const height = Math.max(
    body.scrollHeight, body.offsetHeight,
    html.clientHeight, html.scrollHeight, html.offsetHeight
  );
  return { width, height };
}

// Function to stitch screenshots
async function stitchScreenshots(screenshots: string[], totalScreenshotsVertical: number, totalScreenshotsHorizontal: number, viewportWidth: number, viewportHeight: number, pageWidth: number, pageHeight: number) {
  const canvas = document.createElement('canvas');
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  let index = 0;
  for (let y = 0; y < totalScreenshotsVertical; y++) {
    for (let x = 0; x < totalScreenshotsHorizontal; x++) {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = screenshots[index++];
      });
      ctx.drawImage(img, x * viewportWidth, y * viewportHeight);
      console.log('Viewport dimensions:', { width: viewportWidth, height: viewportHeight });
    }
  }
  return canvas;
}

// Add getFullPageWidth function
function getFullPageWidth() {
  let maxWidth = 0;
  const body = document.body;
  const html = document.documentElement;
  maxWidth = Math.max(
    body.scrollWidth,
    body.offsetWidth,
    html.clientWidth,
    html.scrollWidth,
    html.offsetWidth
  );
  let rightmost = 0;
  const allElements = document.querySelectorAll('*');
  for (const element of allElements) {
    const el = element as HTMLElement;
    if (el.offsetWidth > 0 || el.offsetHeight > 0) {
      const rect = el.getBoundingClientRect();
      const elementRight = rect.right + window.scrollX;
      if (elementRight > maxWidth) {
        maxWidth = elementRight;
      }
      if (elementRight > rightmost) {
        rightmost = elementRight;
      }
    }
  }
  const buffer = 600;
  console.log('Calculated maxWidth:', maxWidth, 'Rightmost element:', rightmost, 'Buffer:', buffer);
  return Math.max(maxWidth, rightmost) + buffer;
}

// Function to capture full page screenshot
async function captureFullPageScreenshot() {
  const messageDiv = document.querySelector('.message');
  if (messageDiv) {
    messageDiv.innerHTML = '<p>Refreshing booking information...</p>';
  }
  // Save original scroll position
  const originalScrollX = window.scrollX;
  const originalScrollY = window.scrollY;
  try {
    const pageWidth = getFullPageWidth();
    const { height: pageHeight } = getPageDimensions();
    const buffer = 600;
    const viewportWidth = Math.max(window.innerWidth, document.documentElement.clientWidth) + buffer;
    console.log('window.innerWidth:', window.innerWidth, 'document.documentElement.clientWidth:', document.documentElement.clientWidth, 'Using viewportWidth:', viewportWidth);
    const viewportHeight = window.innerHeight;
    const totalScreenshotsVertical = Math.ceil(pageHeight / viewportHeight);

    const totalScreenshotsHorizontal = Math.ceil(pageWidth / viewportWidth);
    console.log('FullPageScreenshot:', { pageWidth, pageHeight, viewportWidth, viewportHeight, totalScreenshotsHorizontal, totalScreenshotsVertical });

    const response = await chrome.runtime.sendMessage({
      action: 'takeFullPageScreenshot',
      totalScreenshotsVertical,
      totalScreenshotsHorizontal,
      viewportWidth,
      viewportHeight,
      pageWidth,
      pageHeight
    });

    if (response && response.screenshots && response.screenshots.length) {
      const canvas = await stitchScreenshots(
        response.screenshots,
        totalScreenshotsVertical,
        totalScreenshotsHorizontal,
        viewportWidth,
        viewportHeight,
        pageWidth,
        pageHeight
      );
     
      interface QuestionAnswer {
        question: string;
        answer: string;
      }

      // If your API returns the array directly
    interface DirectArrayResponse extends Array<QuestionAnswer> {}

  // If your API wraps the array in an object (like {results: [...]} as seen in your logs)
    interface WrappedArrayResponse {
      results: QuestionAnswer[];
}

      const questions = [
        "What is the name of the hotel?",
        "What is the address of the hotel?",
        "What is the Customers name? Please keep your answer concise.",
        "What is the Customers email address? Please keep your answer concise.",
        "What is the Customers phone number it might be a mobile number starting 07? Please keep your answer concise.",
        "What is the Customers address? Please keep your answer concise.",
        "What is the Customers city? Please keep your answer concise.",
        "What is the Customers Postcode? Please keep your answer concise.",
        "What is the check in date? Please keep your answer concise and format dates as YYYY-MM-DD",
        "What is the check out date? Please keep your answer concise and format dates as YYYY-MM-DD",
        "What is the room type?",
        "Is the booking canceleable with full refund?",
        
      ];
      canvas.toBlob(async (blob) => {
        if (blob) {
          // Restore original scroll position before API call
          window.scrollTo(originalScrollX, originalScrollY);
          const formData = new FormData();
          formData.append("file", blob, `booking-fullpage-${new Date().toISOString()}.png`);
          formData.append("questions", JSON.stringify(questions));
          try {
            const apiResponse = await fetch("http://localhost:3001/api/ask", {
              method: "POST",
              body: formData
            });
            const result = await apiResponse.json() as WrappedArrayResponse;
            console.log('API response:', result); // Debug log
            console.log('First element:', result.results[0].answer);
            
            // Display the answers first
            const messageDiv = document.querySelector('.message');
            if (messageDiv) {
              // Get the results array from the wrapped response
              const answersArray = result.results || [];
              const answersHtml = answersArray.map(
                (item: QuestionAnswer) => `<div style="margin-bottom:8px;"><strong>Q:</strong> ${item.question}<br><strong>A:</strong> ${item.answer}</div>`
              ).join('');
              
              messageDiv.innerHTML = answersHtml;
              
              // Extract data for second API request
              const hotelName = (answersArray[0]?.answer || '') + ', ' + (answersArray[1]?.answer || '');
              const checkInDate = answersArray[8]?.answer || '';
              const checkOutDate = answersArray[9]?.answer || '';
              
              console.log('answer[0]:', answersArray[0]?.answer);
              console.log('Extracted data:', {
                hotelName,
                checkInDate,
                checkOutDate
              });
              // If we have the required data, make the second API request
              if (hotelName && checkInDate && checkOutDate) {
                // Show "Searching..." message
                messageDiv.innerHTML = '<p>Searching...</p>';
                
                try {
                  // Encode hotel name for URL
                  const encodedHotelName = encodeURIComponent(hotelName);
                  const pricingUrl = `https://autodeal.io/api/prices/VN4?hotelName=${encodedHotelName}&checkInDate=${checkInDate}&checkOutDate=${checkOutDate}&useProxy=true&userCountryCode=US`;
                  console.log('Pricing API URL:', pricingUrl);
                  const pricingResponse = await fetch(pricingUrl);
                  const pricingData = await pricingResponse.json();
                  
                  console.log('Pricing API response:', pricingData);
                  
                  if (Array.isArray(pricingData) && pricingData.length > 0) {
                    // Find the best price (lowest totalPrice)
                    const bestPrice = pricingData.reduce((min, current) => 
                      current.totalPrice < min.totalPrice ? current : min
                    );
                    
                    // Convert USD to GBP (approximate rate: 1 USD = 0.79 GBP)
                    const usdToGbpRate = 0.74;
                    const priceInGbp = bestPrice.userLocalTotalPrice * usdToGbpRate;
                    
                    // Display best price at the top, then the original answers
                    const bestPriceHtml = `<div style="background: #4CAF50; color: white; padding: 10px; margin-bottom: 15px; border-radius: 5px; text-align: center; font-weight: bold; font-size: 18px;">Best price £{priceInGbp.toFixed(2)}</div>`;
                    messageDiv.innerHTML = bestPriceHtml + answersHtml;
                  } else {
                    // No pricing data found, show original answers
                    messageDiv.innerHTML = answersHtml;
                  }
                } catch (pricingError) {
                  console.error('Pricing API error:', pricingError);
                  // Show original answers if pricing request fails
                  messageDiv.innerHTML = answersHtml;
                }
              } else {
                // Missing required data, just show original answers
                messageDiv.innerHTML = answersHtml;
              }
            }
          } catch (err) {
            alert("Failed to send screenshot to API.");
            console.error(err);
          }
        }
      }, 'image/png');
    } else {
      alert('Failed to capture full page screenshot.');
      // Restore original scroll position on failure
      window.scrollTo(originalScrollX, originalScrollY);
    }
  } catch (err) {
    // Restore original scroll position on error
    window.scrollTo(originalScrollX, originalScrollY);
    throw err;
  }
}

// Function to inject the popup HTML
function injectPopup() {
  if (document.getElementById('booking-ai-popup')) return;
  const popupContainer = document.createElement('div');
  popupContainer.id = 'booking-ai-popup-container';
  popupContainer.innerHTML = `
    <div id="booking-ai-popup">
      <div class="header">
        <h1>Zorro AI</h1>
        <button id="close-popup" class="close-button">×</button>
      </div>
      <div class="content">
        <div class="message">
          <p>Hello! I'm your Zorro AI assistant. I can find you the best price in the world...</p>
        </div>
      </div>
      <div class="footer">
        <button id="screenshotBtn" class="screenshot-button">Refresh</button>
      </div>
    </div>
  `;
  const body = document.body || document.getElementsByTagName('body')[0];
  if (body) {
    body.appendChild(popupContainer);
    const closeButton = document.getElementById('close-popup');
    const screenshotBtn = document.getElementById('screenshotBtn');
    const popup = document.getElementById('booking-ai-popup');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        if (popup) popup.style.display = 'none';
      });
    }
    if (screenshotBtn) {
      screenshotBtn.addEventListener('click', captureFullPageScreenshot);
      // Automatically trigger a click when the popup is first displayed
      setTimeout(() => screenshotBtn.click(), 0);
    }
  }
}

// Function to ensure the page is ready
function ensurePageReady() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPopup);
  } else {
    injectPopup();
  }
}

// Start the injection process
ensurePageReady(); 