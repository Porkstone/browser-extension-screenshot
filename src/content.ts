// This script runs on the Booking.com page
console.log('Booking.com AI Assistant is active');
console.log('Content script loaded');

// Constants
const TYPING_SPEED_MS = 37;
const DEV_LOCAL_MODE = false;
const ENABLE_SECOND_QUESTION = true; // Set to false to disable the second question/answer

// Global variables
let bookingData = {
  hotelName: '',
  hotelAddress: '',
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  customerAddress: '',
  customerCity: '',
  customerPostcode: '',
  checkInDate: '',
  checkOutDate: '',
  roomType: '',
  isCancellable: '',
  isSignedIn: '',
  totalCost: '',
  answersArray: [] as Array<{ question: string, answer: string }>,
  readyMessageDisplayed: false,
  pricingData: [] as any[],
  bestPrice: null as any,
  priceInGbp: 0
};

let pricingResults: any = null;
let setupMessagesComplete = false;
let chatWindowExpanded = false;
let emailConfirmationShown = false;
let userRespondedToEmail = false;
let bookingChoiceAnswered = false; // New flag for booking choice
let waitingForFinalMessage = false;
let pricingProcessingComplete = false; // Add flag to prevent duplicate processing
let finalMessageDisplayed = false; // Add flag to prevent duplicate final messages
let threeMessagesComplete = false; // Add flag to track when three messages are complete

// Add userMessages array to store all user messages
let userMessages: string[] = [];

// Change systemMessagesShown to store SystemMessage objects
let systemMessagesShown: SystemMessage[] = [];

// Add SystemMessage interface for system messages
interface SystemMessage {
  key: string;
  greetingMessage: string;
  answer: string;
}

// Add a global counter for user message sends
let userMessageSendCount = 0;

// Add a variable to track when the customer has answered all questions
let customerAnsweredAllQuestions = false;

// Function to update booking data from answers
function updateBookingData(answersArray: Array<{ question: string, answer: string }>) {
  bookingData.answersArray = answersArray;
  bookingData.customerName = answersArray[2]?.answer || ''; // Customer name is at index 2
  bookingData.customerEmail = answersArray[3]?.answer || ''; // Customer email is at index 3
  bookingData.hotelName = (answersArray[0]?.answer || '') + ', ' + (answersArray[1]?.answer || '');
  bookingData.checkInDate = answersArray[8]?.answer || '';
  bookingData.checkOutDate = answersArray[9]?.answer || '';
}

// Function to update pricing data
function updatePricingData(pricingData: any[]) {
  bookingData.pricingData = pricingData;

  if (Array.isArray(pricingData) && pricingData.length > 0) {
    // Find the best price (lowest totalPrice)
    bookingData.bestPrice = pricingData.reduce((min, current) =>
      current.totalPrice < min.totalPrice ? current : min
    );

    // Convert USD to GBP (approximate rate: 1 USD = 0.74 GBP)
    const usdToGbpRate = 0.74;
    bookingData.priceInGbp = bookingData.bestPrice.userLocalTotalPrice * usdToGbpRate;
  } else {
    bookingData.bestPrice = null;
    bookingData.priceInGbp = 0;
  }
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

// Function to create typing animation effect
function typeText(element: HTMLElement, text: string, speed: number = TYPING_SPEED_MS, callback?: () => void) {
  element.textContent = '';
  let index = 0;

  function typeNextChar() {
    if (index < text.length) {
      element.textContent += text.charAt(index);
      index++;
      setTimeout(typeNextChar, speed);
    } else {
      // Animation complete, call callback if provided
      if (callback) {
        callback();
      }
    }
  }

  typeNextChar();
}

// Function to capture full page screenshot
async function captureFullPageScreenshot() {
  const messageDiv = document.querySelector('.message');
  if (messageDiv) {
    // Add refreshing message without overwriting the original content
    const refreshingDiv = document.createElement('div');
    refreshingDiv.style.cssText = 'margin-top: 15px;';
    messageDiv.appendChild(refreshingDiv);

    // Add Reveal button (initially hidden)
    const revealButton = document.createElement('button');
    revealButton.textContent = 'Reveal';
    revealButton.style.cssText = 'background: #10a37f; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; cursor: pointer; margin-top: 15px; display: none; margin-left: auto; margin-right: auto;';
    messageDiv.appendChild(revealButton);

    // Apply typing animation to the message
    typeText(refreshingDiv, 'There is a better value than yours available for this hotel', TYPING_SPEED_MS, () => {
      // Show Reveal button after typing animation completes
      revealButton.style.display = 'block';
    });

    // Add click handler for Reveal button - only expands the chat window
    revealButton.addEventListener('click', async () => {
      // Hide the Reveal button
      revealButton.style.display = 'none';

      // Create and display the spinner with message
      const spinnerContainer = document.createElement('div');
      spinnerContainer.style.cssText = 'display: flex; align-items: center; justify-content: center; margin: 20px 0;';

      const spinner = document.createElement('div');
      spinner.style.cssText = `
        width: 24px;
        height: 24px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #10a37f;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-right: 10px;
      `;

      const style = document.createElement('style');
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);

      const loadingText = document.createElement('span');
      loadingText.textContent = 'Initiating AI protocols';
      loadingText.style.color = '#10a37f';

      spinnerContainer.appendChild(spinner);
      spinnerContainer.appendChild(loadingText);
      const messageDiv = document.querySelector('.message');
      if (messageDiv) {
        messageDiv.appendChild(spinnerContainer);
      }

      // Wait 3 seconds then remove the spinner
      await new Promise(resolve => setTimeout(resolve, 3000));
      spinnerContainer.remove();
      
      if (messageDiv) {
        messageDiv.innerHTML = '';
      }

      // Expand the popup to full page height
      const popup = document.getElementById('booking-ai-popup');
      if (popup) {
        popup.style.height = '100vh';
        popup.style.width = 'calc(100vw - 17px)';
        popup.style.position = 'fixed';
        popup.style.top = '0';
        popup.style.left = '0';
        popup.style.zIndex = '9999';
        popup.classList.add('expanded');
      }

      // Enable minimize button when popup is expanded
      const minimizeButton = document.getElementById('minimize-popup') as HTMLButtonElement;
      if (minimizeButton) {
        minimizeButton.disabled = false;
      }

      // Disable maximize button when popup is expanded
      const maximizeButton = document.getElementById('maximize-popup') as HTMLButtonElement;
      if (maximizeButton) {
        maximizeButton.disabled = true;
      }

      // Set the chat window expanded flag
      chatWindowExpanded = true;

      // If the API response has already been processed, display the messages now
      if (bookingData.customerName || bookingData.answersArray.length > 0) {
        // Display the greeting and booking choice messages
        if (bookingData.customerName && bookingData.customerName.trim() !== '') {
          const firstName = bookingData.customerName.split(' ')[0];
          const greetingHtml = `<div class="ai-message">Hi ${firstName},</div>`;
          if (messageDiv) {
            messageDiv.innerHTML = greetingHtml;
            systemMessagesShown.push({ key: 'greeting_name', greetingMessage: `Hi ${firstName},`, answer: '' });
            console.log('systemMessagesShown:', systemMessagesShown);
          }
        }

        // Display the booking choice message and buttons
        const bookingChoiceHtml = `<div id="booking-choice-message" class="ai-message"></div>`;

        if (messageDiv) {
          messageDiv.innerHTML = messageDiv.innerHTML + bookingChoiceHtml;
        }

        // Apply typing animation to the booking choice message
        const bookingChoiceMessage = document.getElementById('booking-choice-message');
        if (bookingChoiceMessage) {
          typeText(bookingChoiceMessage, 'Do you want me to complete the booking for you as your AI Co-pilot or do it yourself?', TYPING_SPEED_MS, () => {
            // Mark setup messages as complete after typing animation
            setupMessagesComplete = true;
            systemMessagesShown.push({ key: 'booking_choice', greetingMessage: 'Do you want me to complete the booking for you as your AI Co-pilot or do it yourself?', answer: '' });
            console.log('systemMessagesShown:', systemMessagesShown);
          });
        }
      }

      // The screenshot process is now handled automatically when the popup first loads
      // No need to call startScreenshotProcess() here anymore
    });
  }
}

// Function to handle the actual screenshot process
async function startScreenshotProcess() {
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
      interface DirectArrayResponse extends Array<QuestionAnswer> { }

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
        "Is the customer signed in to the website? Please answer yes or no",
        "What is the total cost of the booking? Please provide a number without any currency symbols",
        "What currency is the total cost of the booking in? Please answer in the format of GBP, USD, EUR, etc."
      ];
      
      canvas.toBlob(async (blob) => {
        if (blob) {
          // Restore original scroll position before API call
          window.scrollTo(originalScrollX, originalScrollY);
          const formData = new FormData();
          formData.append("file", blob, `booking-fullpage-${new Date().toISOString()}.png`);
          formData.append("questions", JSON.stringify(questions));

          // Make first API call and display greeting immediately
          const apiResponse = await fetch(DEV_LOCAL_MODE ? "http://localhost:3001/api/ask" : "https://capture-booking-data-api.vercel.app/api/ask", {
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

 // If customer is signed out, set userRespondedToEmail to true
 const isSignedIn = result.results.find(qa => qa.question.includes("Is the customer signed in"))?.answer.toLowerCase() === "yes";
 if (!isSignedIn) {
   userRespondedToEmail = true;
 }

            // Check for customer name and add greeting immediately
            let finalHtml = '';
            if (bookingData.customerName && bookingData.customerName.trim() !== '') {
              // Extract first name from full name
              const firstName = bookingData.customerName.split(' ')[0];
              const greetingHtml = `<div class="ai-message">Hi ${firstName},</div>`;
              finalHtml = greetingHtml;
            } else {
              // Display message without greeting when customer name is blank
              const greetingHtml = ``;
              finalHtml = greetingHtml;
            }

            // Only display messages if the chat window has been expanded
            if (chatWindowExpanded) {
              // Preserve the original greeting message and only add new content if needed
              if (finalHtml) {
                // Only add the greeting if there's content to add
                messageDiv.innerHTML = messageDiv.innerHTML + finalHtml;
                if (bookingData.customerName && bookingData.customerName.trim() !== '') {
                  const firstName = bookingData.customerName.split(' ')[0];
                  systemMessagesShown.push({ key: 'greeting_name', greetingMessage: `Hi ${firstName},`, answer: '' });
                  console.log('systemMessagesShown:', systemMessagesShown);
                }
              }

              // Display the booking choice message and buttons after the greeting
              const bookingChoiceHtml = `<div id="booking-choice-message" class="ai-message"></div>`;

              messageDiv.innerHTML = messageDiv.innerHTML + bookingChoiceHtml;

              // Apply typing animation to the booking choice message
              const bookingChoiceMessage = document.getElementById('booking-choice-message');
              if (bookingChoiceMessage) {
                typeText(bookingChoiceMessage, 'Do you want me to complete the booking for you as your AI Co-pilot or do it yourself?', TYPING_SPEED_MS, () => {
                  // Mark setup messages as complete after typing animation
                  setupMessagesComplete = true;
                  systemMessagesShown.push({ key: 'booking_choice', greetingMessage: 'Do you want me to complete the booking for you as your AI Co-pilot or do it yourself?', answer: '' });
                  console.log('systemMessagesShown:', systemMessagesShown);
                });
              }
            }

            // Make four parallel API calls for pricing data
            const hotelName = encodeURIComponent((answersArray[0]?.answer || '') + ', ' + (answersArray[1]?.answer || ''));

            // First API call - Vietnam
            const pricingResponseVN = fetch(`https://sp.autodeal.io/api/prices/VN4?hotelName=${hotelName}&checkInDate=${answersArray[8]?.answer || ''}&checkOutDate=${answersArray[9]?.answer || ''}&useProxy=true&userCountryCode=US`);

            // Second API call - Thailand
            const pricingResponseTH = fetch(`https://sp.autodeal.io/api/prices/TH4?hotelName=${hotelName}&checkInDate=${answersArray[8]?.answer || ''}&checkOutDate=${answersArray[9]?.answer || ''}&useProxy=true&userCountryCode=US`);

            // Third API call - UK
            const pricingResponseUK = fetch(`https://autodeal.io/api/prices/UK4?hotelName=${hotelName}&checkInDate=${answersArray[8]?.answer || ''}&checkOutDate=${answersArray[9]?.answer || ''}&useProxy=true&userCountryCode=US`);

            // Fourth API call - US
            const pricingResponseUS = fetch(`https://autodeal.io/api/prices/US4?hotelName=${hotelName}&checkInDate=${answersArray[8]?.answer || ''}&checkOutDate=${answersArray[9]?.answer || ''}&useProxy=true&userCountryCode=US`);

            // Wait for all four API calls to complete with 5 second delay
            const [pricingDataVN, pricingDataTH, pricingDataUK, pricingDataUS] = await Promise.all([
              pricingResponseVN.then(response => response.json()),
              pricingResponseTH.then(response => response.json()),
              pricingResponseUK.then(response => response.json()),
              pricingResponseUS.then(response => response.json())
            ]);

            console.log('Pricing API response VN:', pricingDataVN);
            console.log('Pricing API response TH:', pricingDataTH);
            console.log('Pricing API response UK:', pricingDataUK);
            console.log('Pricing API response US:', pricingDataUS);

            console.log('About to process pricing data immediately...');

            // Prevent duplicate processing
            if (pricingProcessingComplete) {
              console.log('Pricing processing already complete, skipping...');
              return;
            }

            try {
              // Helper function to get best price from data
              const getBestPrice = (data: any) => {
                if (data && Array.isArray(data) && data.length > 0) {
                  // Filter out prices that are 0 or less, then find the minimum
                  const validPrices = data.filter(item => item.totalPrice > 0);
                  if (validPrices.length > 0) {
                    return validPrices.reduce((min, current) => current.totalPrice < min.totalPrice ? current : min);
                  }
                }
                return null;
              };

              const bestPriceVN = getBestPrice(pricingDataVN);
              const bestPriceTH = getBestPrice(pricingDataTH);
              const bestPriceUK = getBestPrice(pricingDataUK);
              const bestPriceUS = getBestPrice(pricingDataUS);

              // Find the lowest price among all four (only consider valid prices > 0)
              let bestPricingData = null;
              let bestCountry = '';

              // Compare all valid prices and find the lowest
              const validPrices = [
                { data: pricingDataVN, price: bestPriceVN, country: 'Vietnam' },
                { data: pricingDataTH, price: bestPriceTH, country: 'Thailand' },
                { data: pricingDataUK, price: bestPriceUK, country: 'UK' },
                { data: pricingDataUS, price: bestPriceUS, country: 'US' }
              ].filter(item => item.price !== null);

              if (validPrices.length > 0) {
                const bestOption = validPrices.reduce((min, current) =>
                  current.price.totalPrice < min.price.totalPrice ? current : min
                );
                bestPricingData = bestOption.data;
                bestCountry = bestOption.country;
              }

              console.log('Pricing API processing completed:');
              console.log('- validPrices.length:', validPrices.length);
              console.log('- bestPricingData:', bestPricingData);
              console.log('- bestCountry:', bestCountry);

              // Update pricing data in context with the best result
              updatePricingData(bestPricingData);

              console.log('About to process pricing data immediately...');

              // Process pricing data and store results (only if we have valid pricing data)
              console.log('Processing pricing data...');
              console.log('bestPricingData:', bestPricingData);
              console.log('bookingData.pricingData:', bookingData.pricingData);
              console.log('bookingData.pricingData.length:', bookingData.pricingData?.length);

              if (bestPricingData) {
                console.log('bestPricingData is valid, proceeding to set pricingResults');
                // Get the hotel name from answers array index 0
                const hotelName = answersArray[0]?.answer || 'Unknown Hotel';

                // Get the country name from the best price data
                const countryName = bookingData.bestPrice?.apiCountryName || 'Unknown Country';

                // Calculate the actual savings
                const bookingComPrice = parseFloat(answersArray[13]?.answer || '0'); // This is in GBP
                const bestPriceUSD = bookingData.bestPrice?.totalPrice || 0; // This is in USD
                const bestPriceGBP = bestPriceUSD * 0.73; // Convert USD to GBP (approximate rate)
                const savingsGBP = bookingComPrice - bestPriceGBP; // Both prices now in GBP

                console.log('Calculated values:');
                console.log('- hotelName:', hotelName);
                console.log('- countryName:', countryName);
                console.log('- bookingComPrice:', bookingComPrice);
                console.log('- bestPriceUSD:', bestPriceUSD);
                console.log('- bestPriceGBP:', bestPriceGBP);
                console.log('- savingsGBP:', savingsGBP);

                // Store the pricing results for later display
                pricingResults = {
                  hotelName,
                  countryName,
                  savingsGBP,
                  bookingLink: bookingData.bestPrice?.bookingLink || '',
                  hasCheaperPrice: savingsGBP >= 0,
                };

                console.log('pricingResults set to:', pricingResults);

                console.log('Pricing results stored, checking if setup messages are complete');


                // Note: Final message will be triggered from user message handling flow
                // after user responds to email confirmation and three messages complete
              } else {
                console.log('bestPricingData is null or invalid, setting hasCheaperPrice to false');
                // No cheaper price found
                pricingResults = {
                  hotelName: answersArray[0]?.answer || 'Unknown Hotel',
                  countryName: 'Unknown Country',
                  savingsGBP: 0,
                  bookingLink: '',
                  hasCheaperPrice: false
                };

                console.log('pricingResults set to (no cheaper price):', pricingResults);

                console.log('No pricing data found, checking if setup messages are complete');

              }
            } catch (error) {
              console.error('Error in pricing processing:', error);
            }

            // Mark processing as complete
            pricingProcessingComplete = true;
            console.log('Pricing processing marked as complete');
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
        <h1>Zorro Co-pilot${DEV_LOCAL_MODE ? ' (Dev Local)' : ''}</h1>
        <div class="header-buttons">
          <button id="minimize-popup" class="minimize-button" disabled>−</button>
          <button id="maximize-popup" class="maximize-button" disabled>□</button>
          <button id="close-popup" class="close-button">×</button>
        </div>
      </div>
      <div class="content">
        <div class="message">
          <div id="greeting-message"></div>
        </div>
      </div>
      <div class="footer">
        <button id="screenshotBtn" class="screenshot-button" style="display: none;">Refresh</button>
      </div>
      <div id="chat-input-container" style="display: none;">
        <div class="input-wrapper">
          <input type="text" id="chat-input" placeholder="Type your message..." />
          <button id="send-message-btn">Send</button>
        </div>
      </div>
    </div>
  `;
  const body = document.body || document.getElementsByTagName('body')[0];
  if (body) {
    body.appendChild(popupContainer);
    const closeButton = document.getElementById('close-popup');
    const minimizeButton = document.getElementById('minimize-popup') as HTMLButtonElement;
    const maximizeButton = document.getElementById('maximize-popup') as HTMLButtonElement;
    const screenshotBtn = document.getElementById('screenshotBtn');
    const popup = document.getElementById('booking-ai-popup');
    const greetingMessage = document.getElementById('greeting-message');
    const chatInputContainer = document.getElementById('chat-input-container');
    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    const sendMessageBtn = document.getElementById('send-message-btn');

    // Add maximize button functionality
    if (maximizeButton) {
      maximizeButton.addEventListener('click', () => {
        if (popup) {
          // Expand popup to full page
          popup.style.height = '100vh';
          popup.style.width = 'calc(100vw - 17px)';
          popup.style.position = 'fixed';
          popup.style.top = '0';
          popup.style.left = '0';
          popup.style.bottom = 'auto';
          popup.style.right = 'auto';
          popup.style.zIndex = '9999';
          popup.classList.add('expanded');
          
          // Show chat input container
          if (chatInputContainer) {
            chatInputContainer.style.display = 'block';
          }
          
          // Enable minimize button and disable maximize button
          if (minimizeButton) {
            minimizeButton.disabled = false;
          }
          maximizeButton.disabled = true;
          
          // Set chat window expanded flag
          chatWindowExpanded = true;
        }
      });
    }

    // Add minimize button functionality
    if (minimizeButton) {
      minimizeButton.addEventListener('click', () => {
        if (popup) {
          // Restore original popup size and position
          popup.style.height = '26.1875rem';
          popup.style.width = '24rem';
          popup.style.position = 'fixed';
          popup.style.bottom = '1rem';
          popup.style.right = '1rem';
          popup.style.top = 'auto';
          popup.style.left = 'auto';
          popup.style.zIndex = '9999';
          popup.classList.remove('expanded');
          
          // Hide chat input container
          if (chatInputContainer) {
            chatInputContainer.style.display = 'none';
          }
          
          // Disable minimize button and enable maximize button
          minimizeButton.disabled = true;
          if (maximizeButton) {
            maximizeButton.disabled = false;
          }
          
          // Reset chat window expanded flag
          chatWindowExpanded = false;
        }
      });
    }

    // Start typing animation for the greeting message
    if (greetingMessage) {
      const greetingMessageText = 'Hello, I am your co-pilot for optimising this payment.'
      typeText(greetingMessage, greetingMessageText, TYPING_SPEED_MS, () => {
        systemMessagesShown.push({ key: 'greeting', greetingMessage: greetingMessageText, answer: '' });
        
        // After greeting message finishes typing, wait 2 seconds then show the second message
        setTimeout(() => {
          const secondMessage = document.createElement('div');
          const secondMessageText = 'For this hotel, there is a better option than yours available'
          secondMessage.style.cssText = 'margin-top: 15px; text-align: left;';
          greetingMessage.parentElement?.appendChild(secondMessage);

          // Apply typing animation to the second message
          typeText(secondMessage, secondMessageText, TYPING_SPEED_MS, () => {
            systemMessagesShown.push({ key: 'greeting_better_value', greetingMessage: secondMessageText, answer: '' });
            console.log('systemMessagesShown:', systemMessagesShown);
            // After second message finishes typing, show the Reveal button
            const revealButton = document.createElement('button');
            revealButton.textContent = 'Reveal';
            revealButton.style.cssText = 'background: #10a37f; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; cursor: pointer; margin-top: 15px; display: block; margin-left: auto; margin-right: auto;';
            greetingMessage.parentElement?.appendChild(revealButton);

            // Add click handler for Reveal button - only expands the chat window
            revealButton.addEventListener('click', async () => {
              // Hide the Reveal button
              revealButton.style.display = 'none';

              
              // Clear the message div contents
              const messageDiv = document.querySelector('.message');
             

              // Create and display the spinner with message
              const spinnerContainer = document.createElement('div');
              spinnerContainer.style.cssText = 'display: flex; align-items: center; justify-content: center; margin: 20px 0;';

              const spinner = document.createElement('div');
              spinner.style.cssText = `
                width: 24px;
                height: 24px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #10a37f;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-right: 10px;
              `;

              const style = document.createElement('style');
              style.textContent = `
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `;
              document.head.appendChild(style);

              const loadingText = document.createElement('span');
              loadingText.textContent = 'Initiating AI protocols';
              loadingText.style.color = '#10a37f';

              spinnerContainer.appendChild(spinner);
              spinnerContainer.appendChild(loadingText);
              
              if (messageDiv) {
                messageDiv.appendChild(spinnerContainer);
              }

              // Wait 3 seconds then remove the spinner
              await new Promise(resolve => setTimeout(resolve, 3000));
              spinnerContainer.remove();
              
              if (messageDiv) {
                messageDiv.innerHTML = '';
              }

              // Expand the popup to full page height
              const popup = document.getElementById('booking-ai-popup');
              if (popup) {
                popup.style.height = '100vh';
                popup.style.width = 'calc(100vw - 17px)';
                popup.style.position = 'fixed';
                popup.style.top = '0';
                popup.style.left = '0';
                popup.style.zIndex = '9999';
                popup.classList.add('expanded');
              }

              // Enable minimize button when popup is expanded
              const minimizeButton = document.getElementById('minimize-popup') as HTMLButtonElement;
              if (minimizeButton) {
                minimizeButton.disabled = false;
              }

              // Disable maximize button when popup is expanded
              const maximizeButton = document.getElementById('maximize-popup') as HTMLButtonElement;
              if (maximizeButton) {
                maximizeButton.disabled = true;
              }

              // Show the chat input container
              if (chatInputContainer) {
                chatInputContainer.style.display = 'block';
              }

              // Set the chat window expanded flag
              chatWindowExpanded = true;

              // If the API response has already been processed, display the messages now
              if (bookingData.customerName || bookingData.answersArray.length > 0) {
                // Display the greeting and booking choice messages
                if (bookingData.customerName && bookingData.customerName.trim() !== '') {
                  const firstName = bookingData.customerName.split(' ')[0];
                  const greetingHtml = `<div class="ai-message">Hi ${firstName},</div>`;
                  if (messageDiv) {
                    messageDiv.innerHTML = greetingHtml;
                    systemMessagesShown.push({ key: 'greeting_name', greetingMessage: `Hi ${firstName},`, answer: '' });
                    console.log('systemMessagesShown:', systemMessagesShown);
                  }
                }

                // Display the booking choice message and buttons
                const bookingChoiceHtml = `<div id="booking-choice-message" class="ai-message"></div>`;

                if (messageDiv) {
                  messageDiv.innerHTML = messageDiv.innerHTML + bookingChoiceHtml;
                }

                // Apply typing animation to the booking choice message
                const bookingChoiceMessage = document.getElementById('booking-choice-message');
                if (bookingChoiceMessage) {
                  typeText(bookingChoiceMessage, 'Do you want me to complete the booking for you as your AI Co-pilot or do it yourself?', TYPING_SPEED_MS, () => {
                    // Mark setup messages as complete after typing animation
                    setupMessagesComplete = true;
                    systemMessagesShown.push({ key: 'booking_choice', greetingMessage: 'Do you want me to complete the booking for you as your AI Co-pilot or do it yourself?', answer: '' });
                    console.log('systemMessagesShown:', systemMessagesShown);
                  });
                }
              }

              // The screenshot process is now handled automatically when the popup first loads
              // No need to call startScreenshotProcess() here anymore
            });
          });
        }, 2000);
      });
    }

    // Add event handlers for chat input
    if (sendMessageBtn && chatInput) {
      const handleSendMessage = () => {
        userMessageSendCount++;
        console.log('User message send count:', userMessageSendCount);
        const message = chatInput.value.trim();
        if (message) {
          // If this is the first user message, store it as the answer for booking_choice
          if (userMessageSendCount === 1) {
            const idx = systemMessagesShown.findIndex(msg => msg.key === 'booking_choice' && msg.answer === '');
            if (idx !== -1) {
              systemMessagesShown[idx].answer = message;
              bookingChoiceAnswered = true;
              console.log('systemMessagesShown (set booking_choice answer on first message):', systemMessagesShown);
            }
          }
          // If this is the second user message, store it as the answer for email_confirmation
          if (userMessageSendCount === 2) {
            const idx = systemMessagesShown.findIndex(msg => msg.key === 'email_confirmation' && msg.answer === '');
            if (idx !== -1) {
              systemMessagesShown[idx].answer = message;
              userRespondedToEmail = true;
              console.log('systemMessagesShown (set email_confirmation answer on second message):', systemMessagesShown);
            }
            // Disable the Send button
            if (sendMessageBtn) {
              (sendMessageBtn as HTMLButtonElement).disabled = true;
              (sendMessageBtn as HTMLButtonElement).style.background = '#ccc';
              (sendMessageBtn as HTMLButtonElement).style.color = '#888';
              (sendMessageBtn as HTMLButtonElement).style.cursor = 'not-allowed';
            }
          }
          // Add user message to array
          userMessages.push(message);
          // Add user message to chat
          const messageDiv = document.querySelector('.message');
          if (messageDiv) {
            const userMessageDiv = document.createElement('div');
            userMessageDiv.className = 'user-message';
            userMessageDiv.textContent = message;
            messageDiv.appendChild(userMessageDiv);
          }
          // Clear input
          chatInput.value = '';
          // Here you can add logic to handle the message (e.g., send to API, etc.)
          console.log('User message:', message);

          // Set customerAnsweredAllQuestions to true after both answers are stored
          const hasBookingChoiceAnswer = systemMessagesShown.some(msg => msg.key === 'booking_choice' && msg.answer !== '');
          const hasEmailConfirmationAnswer = bookingData.isSignedIn
            ? systemMessagesShown.some(msg => msg.key === 'email_confirmation' && msg.answer !== '')
            : true; // If not signed in, treat as answered
          if (hasBookingChoiceAnswer && hasEmailConfirmationAnswer && !customerAnsweredAllQuestions) {
            customerAnsweredAllQuestions = true;
            console.log('customerAnsweredAllQuestions set to true');
            // Display the next three system messages in sequence and store each one
            const messageDiv = document.querySelector('.message');
            if (messageDiv) {
              // First system message
              const firstMessageDiv = document.createElement('div');
              firstMessageDiv.className = 'ai-message';
              messageDiv.appendChild(firstMessageDiv);
              typeText(firstMessageDiv, 'I have everything I need now. Let me load your results', TYPING_SPEED_MS, () => {
                systemMessagesShown.push({ key: 'three_msg_1', greetingMessage: 'I have everything I need now. Let me load your results', answer: '' });
                console.log('systemMessagesShown:', systemMessagesShown);
                // Second system message
                setTimeout(() => {
                  const secondMessageDiv = document.createElement('div');
                  secondMessageDiv.className = 'ai-message';
                  messageDiv.appendChild(secondMessageDiv);
                  typeText(secondMessageDiv, 'I will show you the country that offers the best value for your hotel', TYPING_SPEED_MS, () => {
                    systemMessagesShown.push({ key: 'three_msg_2', greetingMessage: 'I will show you the country that offers the best value for your hotel', answer: '' });
                    console.log('systemMessagesShown:', systemMessagesShown);
                    // Third system message
                    setTimeout(() => {
                      const thirdMessageDiv = document.createElement('div');
                      thirdMessageDiv.className = 'ai-message';
                      messageDiv.appendChild(thirdMessageDiv);
                      typeText(thirdMessageDiv, 'and how much better it is than Booking.com', TYPING_SPEED_MS, () => {
                        systemMessagesShown.push({ key: 'three_msg_3', greetingMessage: 'and how much better it is than Booking.com', answer: '' });
                        console.log('systemMessagesShown:', systemMessagesShown);
                        // After all three messages complete, wait 1 second then check for pricing results
                        setTimeout(() => {
                          threeMessagesComplete = true;
                          let attempts = 0;
                          const maxAttempts = 20;
                          async function pollFinalMessage() {
                            while (!finalMessageDisplayed && attempts < maxAttempts) {
                              attempts++;
                              await new Promise(resolve => {
                                maybeShowFinalMessage();
                                setTimeout(resolve, 10000);
                              });
                            }
                          }
                          pollFinalMessage();
                        }, 1000);
                      });
                    }, 1000);
                  });
                }, 1000);
              });
            }
          }

          // Display email confirmation message after user types (only if not already shown and we have customer email)
          if (!emailConfirmationShown && bookingData.customerEmail && bookingData.customerEmail.trim() !== '') {
            setTimeout(() => {
              const messageDiv = document.querySelector('.message');
              if (messageDiv) {
                const emailConfirmationDiv = document.createElement('div');
                emailConfirmationDiv.className = 'ai-message';
                messageDiv.appendChild(emailConfirmationDiv);
                // Apply typing animation to the email confirmation message
                typeText(emailConfirmationDiv, `I can send email confirmation to ${bookingData.customerEmail} is this the correct address?`, TYPING_SPEED_MS, () => {
                  systemMessagesShown.push({ key: 'email_confirmation', greetingMessage: `I can send email confirmation to ${bookingData.customerEmail} is this the correct address?`, answer: '' });
                  console.log('systemMessagesShown:', systemMessagesShown);
                  // Mark as shown to prevent duplicate messages
                  emailConfirmationShown = true;
                });
              }
            }, 1000); // Wait 1 second before showing the email confirmation
          }
        }
      };

      
      // Helper to show final message if all conditions are met
      function maybeShowFinalMessage() {
        console.log('maybeShowFinalMessage called');
        if (
          pricingResults &&
          userRespondedToEmail &&
          bookingChoiceAnswered &&
          threeMessagesComplete &&
          !finalMessageDisplayed 
        ) {

          console.log('All conditions met for final message:', {
            pricingResults: !!pricingResults,
            hasCheaperPrice: pricingResults?.hasCheaperPrice,
            userRespondedToEmail,
            bookingChoiceAnswered,
            threeMessagesComplete,
            finalMessageDisplayed
          });

          finalMessageDisplayed = true;
          if (pricingResults.hasCheaperPrice) {
          setTimeout(() => {
            const messageDiv = document.querySelector('.message');
            let finalMessageContainer = document.getElementById('final-message-container');
            if (!finalMessageContainer) {
              finalMessageContainer = document.createElement('div');
              finalMessageContainer.id = 'final-message-container';
              finalMessageContainer.style.marginTop = '24px';
              finalMessageContainer.style.width = '100%'
              finalMessageContainer.classList.add('message');
              // Insert after the main message div
              if (messageDiv && messageDiv.parentElement) {
                messageDiv.parentElement.appendChild(finalMessageContainer);
              }
            }
            if (finalMessageContainer) {
              // Scroll to bottom before displaying the final message
              finalMessageContainer.scrollTop = finalMessageContainer.scrollHeight;
              const finalMessageDiv = document.createElement('div');
              finalMessageDiv.className = 'final-message';
              
              finalMessageContainer.appendChild(finalMessageDiv);
              const amountSaved = pricingResults.savingsGBP.toFixed(2);
              const bookingLink = pricingResults.bookingLink || '#';
              const hotelNameHtml = `<span style=\"font-weight: bold;\">${pricingResults.hotelName}</span>`;
              const countryHtml = `<span style=\"color: #10a37f;\">${pricingResults.countryName}</span>`;
              const amountSavedHtml = `<span style=\"color: #10a37f;\">£${amountSaved}</span>`;
              const bookingLinkHtml = `<a href=\"${bookingLink}\" target=\"_blank\" style=\"color: #10a37f; text-decoration: underline;\">booking link</a>`;
              const finalMessageHtml = `I found the best value for ${hotelNameHtml} in ${countryHtml}<br>It is ${amountSavedHtml} better than on Booking.com<br>As you chose to self-complete the payment, here is the ${bookingLinkHtml}`;
              finalMessageDiv.innerHTML = finalMessageHtml;
              finalMessageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
              setTimeout(() => {
                window.scrollBy(0, -40); // scroll up 40px for padding
              }, 600);
              systemMessagesShown.push({ key: 'final_result', greetingMessage: finalMessageHtml, answer: '' });
              console.log('systemMessagesShown:', systemMessagesShown);
              waitingForFinalMessage = false;
                console.log('Final message displayed and marked as shown');
              }
            }, 1000);
          } else {
            console.log('No cheaper price found, skipping final message');
            finalMessageDisplayed = true;
            waitingForFinalMessage = false;
            console.log('Final message displayed and marked as shown');
          }
        } else {
          console.log('Not all conditions met for final message:', {
            pricingResults: !!pricingResults,
            hasCheaperPrice: pricingResults?.hasCheaperPrice,
            userRespondedToEmail,
            bookingChoiceAnswered,
            threeMessagesComplete,
            finalMessageDisplayed
          });
        }
      }

 

      sendMessageBtn.addEventListener('click', handleSendMessage);

      // Allow Enter key to send message
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleSendMessage();
        }
      });
    }

    if (closeButton) {
      closeButton.addEventListener('click', () => {
        if (popup) popup.style.display = 'none';
      });
    }
    if (screenshotBtn) {
      screenshotBtn.addEventListener('click', captureFullPageScreenshot);
      // Automatically trigger the full-page screenshot process when the popup is first displayed
      setTimeout(() => startScreenshotProcess(), 3000);
    }

    // After displaying the booking choice message (i.e., after typeText for bookingChoiceMessage), enable the Send button:
    if (sendMessageBtn) {
      (sendMessageBtn as HTMLButtonElement).disabled = false;
      (sendMessageBtn as HTMLButtonElement).style.background = '#10a37f';
      (sendMessageBtn as HTMLButtonElement).style.color = 'white';
      (sendMessageBtn as HTMLButtonElement).style.cursor = 'pointer';
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

// Function to wait for the ready message to be displayed
async function waitForReadyMessage(): Promise<void> {
  console.log('waitForReadyMessage called, bookingData.readyMessageDisplayed:', bookingData.readyMessageDisplayed);
  return new Promise((resolve) => {
    const checkReadyMessage = () => {
      console.log('Checking ready message, bookingData.readyMessageDisplayed:', bookingData.readyMessageDisplayed);
      if (bookingData.readyMessageDisplayed) {
        console.log('Ready message is displayed, resolving promise');
        resolve();
      } else {
        console.log('Ready message not displayed yet, checking again in 100ms');
        setTimeout(checkReadyMessage, 100); // Check every 100ms
      }
    };
    checkReadyMessage();
  });
}

// Function to display pricing results
function displayPricingResults() {
  console.log('displayPricingResults called');
  console.log('pricingResults:', pricingResults);

  // Prevent duplicate final messages
  if (finalMessageDisplayed) {
    console.log('Final message already displayed, skipping displayPricingResults...');
    return;
  }

  // Don't display final messages if we're waiting for user response flow
  if (waitingForFinalMessage) {
    console.log('Waiting for final message from user flow, skipping displayPricingResults...');
    return;
  }

  if (!pricingResults) {
    console.log('No pricing results available');
    return;
  }

  const contentDiv = document.querySelector('.content');
  if (!contentDiv) {
    console.log('No content div found');
    return;
  }

  // Create a second message div for pricing results
  const pricingMessageDiv = document.createElement('div');
  pricingMessageDiv.className = 'message';
  pricingMessageDiv.style.cssText = 'margin-top: 30px; border-top: 1px solid #565869; padding-top: 20px; min-height: 200px; max-width: 800px;';
  contentDiv.appendChild(pricingMessageDiv);

  console.log('hasCheaperPrice:', pricingResults.hasCheaperPrice);

  if (pricingResults.hasCheaperPrice) {
    console.log('Displaying pricing messages');

    // Mark as displayed to prevent duplicates
    finalMessageDisplayed = true;
    console.log('Final message marked as displayed in displayPricingResults');

    // Display first message immediately
    const firstMessage = document.createElement('div');
    firstMessage.className = 'ai-message';
    pricingMessageDiv.appendChild(firstMessage);

    // Apply typing animation to the first message
    typeText(firstMessage, `I found the best value for ${pricingResults.hotelName} in ${pricingResults.countryName}`, TYPING_SPEED_MS, () => {
      // After typing animation completes, replace with HTML to color the country name
      if (pricingResults) {
        firstMessage.innerHTML = `I found the best value for ${pricingResults.hotelName} in <span style="color: rgb(16, 163, 127);">${pricingResults.countryName}</span>`;
      }

      // Scroll to the bottom of the page after first message is displayed
      if (contentDiv) {
        contentDiv.scrollTo({
          top: contentDiv.scrollHeight,
          behavior: 'smooth'
        });
      }

      // Display second message after first message typing completes
      setTimeout(() => {
        const secondMessage = document.createElement('div');
        secondMessage.className = 'ai-message';
        pricingMessageDiv.appendChild(secondMessage);

        // Apply typing animation to the second message
        typeText(secondMessage, `It is £${pricingResults!.savingsGBP.toFixed(2)} better than on Booking.com`, TYPING_SPEED_MS, () => {
          // Display third message after second message typing completes
          setTimeout(() => {
            // Check if bestPrice data is available
            if (pricingResults!.bookingLink) {
              const thirdMessage = document.createElement('div');
              thirdMessage.className = 'ai-message';
              pricingMessageDiv.appendChild(thirdMessage);

              // Apply typing animation to the third message
              typeText(thirdMessage, `Here is the booking link for you, happy to help with this payment `, TYPING_SPEED_MS, () => {
                // Add the link after the text is typed
                const linkElement = document.createElement('a');
                linkElement.href = pricingResults!.bookingLink;
                linkElement.target = '_blank';
                linkElement.style.cssText = 'color: #007bff; text-decoration: underline;';
                linkElement.textContent = 'Book Now';
                thirdMessage.appendChild(linkElement);
              });
            }
          }, 2000);
        });
      }, 2000);
    });
  } else {
    console.log('Displaying no better price message');
    // No cheaper price found - display alternative message
    const noCheaperMessage = document.createElement('div');
    noCheaperMessage.className = 'ai-message';
    pricingMessageDiv.appendChild(noCheaperMessage);

    // Apply typing animation to the no cheaper price message
    typeText(noCheaperMessage, 'On this occasion I was unable to locate a cheaper price, please refresh this page to try again.', TYPING_SPEED_MS);
  }
}
