// This script runs on the Booking.com page
console.log('Booking.com AI Assistant is active');
console.log('Content script loaded');

// Data context to store booking information
const bookingData: {
  answersArray: Array<{question: string, answer: string}>;
  customerName: string;
  customerEmail: string;
  hotelName: string;
  checkInDate: string;
  checkOutDate: string;
} = {
  answersArray: [],
  customerName: '',
  customerEmail: '',
  hotelName: '',
  checkInDate: '',
  checkOutDate: ''
};

// Function to update booking data from answers
function updateBookingData(answersArray: Array<{question: string, answer: string}>) {
  bookingData.answersArray = answersArray;
  bookingData.customerName = answersArray[2]?.answer || ''; // Customer name is at index 2
  bookingData.customerEmail = answersArray[3]?.answer || ''; // Customer email is at index 3
  bookingData.hotelName = (answersArray[0]?.answer || '') + ', ' + (answersArray[1]?.answer || '');
  bookingData.checkInDate = answersArray[8]?.answer || '';
  bookingData.checkOutDate = answersArray[9]?.answer || '';
}

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
          
          // Make first API call and display greeting immediately
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
            
            // Update booking data context
            updateBookingData(answersArray);
            
            console.log('answer[0]:', answersArray[0]?.answer);
            console.log('Extracted data:', {
              hotelName: bookingData.hotelName,
              checkInDate: bookingData.checkInDate,
              checkOutDate: bookingData.checkOutDate
            });
            
            // Check for customer name and add greeting immediately
            let finalHtml = '';
            if (bookingData.customerName && bookingData.customerName.trim() !== '') {
              const greetingHtml = `<div style="padding: 10px; margin-bottom: 15px; text-align: center;">Hi ${bookingData.customerName},</div>
<div style="padding: 10px; margin-bottom: 15px; text-align: center;">After I show you the best deal globally, do you want to complete the booking yourself or let me do it for you? If you choose me, I'll bring you to the checkout where you insert your payment details yourself?</div>
<div style="display: flex; justify-content: center; gap: 15px; margin-bottom: 15px;">
  <button id="bookManually" style="background: #FF9800; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; cursor: pointer;">Book Manually</button>
  <button id="useAIAgent" style="background: #9C27B0; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; cursor: pointer;">Use AI Agent</button>
</div>`;
              finalHtml = greetingHtml;
            }
            
            // Display greeting immediately
            messageDiv.innerHTML = finalHtml;
            
            // Double the height of the popup after screenshot
            const popup = document.getElementById('booking-ai-popup');
            if (popup) {
              const currentHeight = popup.style.height || '400px';
              const currentHeightValue = parseInt(currentHeight);
              popup.style.height = (currentHeightValue * 2) + 'px';
            }
            
            // Add click event handlers for the buttons
            const bookManuallyBtn = document.getElementById('bookManually');
            const useAIAgentBtn = document.getElementById('useAIAgent');
            
            if (bookManuallyBtn) {
              bookManuallyBtn.addEventListener('click', () => {
                bookManuallyBtn.style.background = '#4CAF50';
                bookManuallyBtn.textContent = '✓ Book Manually';
                if (useAIAgentBtn) {
                  useAIAgentBtn.style.background = '#9E9E9E';
                  useAIAgentBtn.style.cursor = 'not-allowed';
                }
                
                // Add 1 second delay before showing follow-up message
                setTimeout(() => {
                  // Add follow-up message
                  const followUpMessage = `<div style="padding: 10px; margin-top: 15px; text-align: center;">Great. What will be the full name and email of the main guest?</div>`;
                  
                  // Add additional buttons if customer name is present
                  let additionalButtons = '';
                  if (bookingData.customerName && bookingData.customerName.trim() !== '') {
                    additionalButtons = `<div style="display: flex; justify-content: center; gap: 15px; margin-top: 15px;">
                      <button id="useMyDetails" style="background: #2196F3; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; cursor: pointer;">My name and email</button>
                      <button id="enterManually" style="background: #FF9800; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; cursor: pointer;">I will enter the details</button>
                    </div>`;
                  }
                  
                  messageDiv.innerHTML = messageDiv.innerHTML + followUpMessage + additionalButtons;
                  
                  // Add click event handlers for the new buttons
                  const useMyDetailsBtn = document.getElementById('useMyDetails');
                  const enterManuallyBtn = document.getElementById('enterManually');
                  
                  if (useMyDetailsBtn) {
                    useMyDetailsBtn.addEventListener('click', () => {
                      useMyDetailsBtn.style.background = '#4CAF50';
                      useMyDetailsBtn.textContent = '✓ My name and email';
                      if (enterManuallyBtn) {
                        enterManuallyBtn.style.background = '#9E9E9E';
                        enterManuallyBtn.style.cursor = 'not-allowed';
                        enterManuallyBtn.textContent = 'I will enter the details';
                      }
                      
                      // Display confirmation message with customer name and email
                      const confirmationMessage = `<div style="padding: 10px; margin-top: 15px; text-align: center;">Great, I will use ${bookingData.customerName} and ${bookingData.customerEmail} when creating the booking</div>`;
                      messageDiv.innerHTML = messageDiv.innerHTML + confirmationMessage;
                    });
                  }
                  
                  if (enterManuallyBtn) {
                    enterManuallyBtn.addEventListener('click', () => {
                      enterManuallyBtn.style.background = '#4CAF50';
                      enterManuallyBtn.textContent = '✓ I will enter the details';
                      if (useMyDetailsBtn) {
                        useMyDetailsBtn.style.background = '#9E9E9E';
                        useMyDetailsBtn.style.cursor = 'not-allowed';
                        useMyDetailsBtn.textContent = 'My name and email';
                      }
                    });
                  }
                }, 1000);
              });
            }
            
            if (useAIAgentBtn) {
              useAIAgentBtn.addEventListener('click', () => {
                useAIAgentBtn.style.background = '#4CAF50';
                useAIAgentBtn.textContent = '✓ Use AI Agent';
                if (bookManuallyBtn) {
                  bookManuallyBtn.style.background = '#9E9E9E';
                  bookManuallyBtn.style.cursor = 'not-allowed';
                }
                
                // Add 1 second delay before showing follow-up message
                setTimeout(() => {
                  // Add follow-up message
                  const followUpMessage = `<div style="padding: 10px; margin-top: 15px; text-align: center;">Great. What will be the full name and email of the main guest?</div>`;
                  
                  // Add additional buttons if customer name is present
                  let additionalButtons = '';
                  if (bookingData.customerName && bookingData.customerName.trim() !== '') {
                    additionalButtons = `<div style="display: flex; justify-content: center; gap: 15px; margin-top: 15px;">
                      <button id="useMyDetails" style="background: #2196F3; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; cursor: pointer;">My name and email</button>
                      <button id="enterManually" style="background: #FF9800; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; cursor: pointer;">I will enter the details</button>
                    </div>`;
                  }
                  
                  messageDiv.innerHTML = messageDiv.innerHTML + followUpMessage + additionalButtons;
                  
                  // Add click event handlers for the new buttons
                  const useMyDetailsBtn = document.getElementById('useMyDetails');
                  const enterManuallyBtn = document.getElementById('enterManually');
                  
                  if (useMyDetailsBtn) {
                    useMyDetailsBtn.addEventListener('click', () => {
                      useMyDetailsBtn.style.background = '#4CAF50';
                      useMyDetailsBtn.textContent = '✓ My name and email';
                      if (enterManuallyBtn) {
                        enterManuallyBtn.style.background = '#9E9E9E';
                        enterManuallyBtn.style.cursor = 'not-allowed';
                        enterManuallyBtn.textContent = 'I will enter the details';
                      }
                      
                      // Display confirmation message with customer name and email
                      const confirmationMessage = `<div style="padding: 10px; margin-top: 15px; text-align: center;">Great, I will use ${bookingData.customerName} and ${bookingData.customerEmail} when creating the booking</div>`;
                      messageDiv.innerHTML = messageDiv.innerHTML + confirmationMessage;
                    });
                  }
                  
                  if (enterManuallyBtn) {
                    enterManuallyBtn.addEventListener('click', () => {
                      enterManuallyBtn.style.background = '#4CAF50';
                      enterManuallyBtn.textContent = '✓ I will enter the details';
                      if (useMyDetailsBtn) {
                        useMyDetailsBtn.style.background = '#9E9E9E';
                        useMyDetailsBtn.style.cursor = 'not-allowed';
                        useMyDetailsBtn.textContent = 'My name and email';
                      }
                    });
                  }
                }, 1000);
              });
            }
            
            // Make second API call for pricing data
            //const pricingResponse = await fetch("https://autodeal.io/api/pricesIN4-mock?hotelName=Russell%20Hotel%2C%2080%20London%20Road%2C%20Royal%20Tunbridge%20Wells%2C%20TN1%201DZ%2C%20United%20Kingdom&checkInDate=2025-08-22&checkOutDate=2025-08-24&useProxy=true&userCountryCode=US");
            const pricingResponse = await fetch("https://autodeal.io/api/prices/IN4?hotelName=Russell%20Hotel%2C%2080%20London%20Road%2C%20Royal%20Tunbridge%20Wells%2C%20TN1%201DZ%2C%20United%20Kingdom&checkInDate=2025-08-22&checkOutDate=2025-08-24&useProxy=true&userCountryCode=US");
            const pricingData = await (async () => {
              await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
              return pricingResponse.json();
            })();
            
            console.log('Pricing API response:', pricingData);
            
            // Process pricing data and update popup
            if (Array.isArray(pricingData) && pricingData.length > 0) {
              // Find the best price (lowest totalPrice)
              const bestPrice = pricingData.reduce((min, current) => 
                current.totalPrice < min.totalPrice ? current : min
              );
              
              // Convert USD to GBP (approximate rate: 1 USD = 0.74 GBP)
              const usdToGbpRate = 0.74;
              const priceInGbp = bestPrice.userLocalTotalPrice * usdToGbpRate;
              
              // Add best price below the existing content
              const bestPriceHtml = `<div style="background: #4CAF50; color: white; padding: 10px; margin-bottom: 15px; border-radius: 5px; text-align: center; font-weight: bold; font-size: 18px;">Best price £${priceInGbp.toFixed(2)}</div>`;
              messageDiv.innerHTML = messageDiv.innerHTML + bestPriceHtml;
            }
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