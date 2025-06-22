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
  pricingData: any[];
  bestPrice: any;
  priceInGbp: number;
  readyMessageDisplayed: boolean;
  useAiAgentClicked: boolean;
} = {
  answersArray: [],
  customerName: '',
  customerEmail: '',
  hotelName: '',
  checkInDate: '',
  checkOutDate: '',
  pricingData: [],
  bestPrice: null,
  priceInGbp: 0,
  readyMessageDisplayed: false,
  useAiAgentClicked: false
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

// Function to capture full page screenshot
async function captureFullPageScreenshot() {
  const messageDiv = document.querySelector('.message');
  if (messageDiv) {
    // Add refreshing message without overwriting the original content
    const refreshingDiv = document.createElement('div');
    refreshingDiv.style.cssText = 'padding: 10px; margin-top: 15px; text-align: center;';
    refreshingDiv.textContent = 'There is a better value than yours available for this hotel';
    messageDiv.appendChild(refreshingDiv);
    
    // Add Reveal button
    const revealButton = document.createElement('button');
    revealButton.textContent = 'Reveal';
    revealButton.style.cssText = 'background: #10a37f; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; cursor: pointer; margin-top: 10px; display: block; margin-left: auto; margin-right: auto;';
    messageDiv.appendChild(revealButton);
    
    // Add click handler for Reveal button
    revealButton.addEventListener('click', async () => {
      // Show spinner
      const spinner = document.createElement('div');
      spinner.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; padding: 20px;">
          <div style="width: 20px; height: 20px; border: 2px solid #565869; border-top: 2px solid #10a37f; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <span style="margin-left: 10px; color: #ececf1;">Processing...</span>
        </div>
      `;
      messageDiv.appendChild(spinner);
      
      // Hide the Reveal button
      revealButton.style.display = 'none';
      
      // Start the screenshot process
      await startScreenshotProcess();
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
        "Is the customer signed in to the website? Please answer yes or no",
        "What is the total cost of the booking? Please provide a number without any currency symbols"
        
      ];
      canvas.toBlob(async (blob) => {
        if (blob) {
          // Restore original scroll position before API call
          window.scrollTo(originalScrollX, originalScrollY);
          const formData = new FormData();
          formData.append("file", blob, `booking-fullpage-${new Date().toISOString()}.png`);
          formData.append("questions", JSON.stringify(questions));
          
          // Make first API call and display greeting immediately
          const apiResponse = await fetch("https://capture-booking-data-api.vercel.app/api/ask", {
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
              // Extract first name from full name
              const firstName = bookingData.customerName.split(' ')[0];
              const greetingHtml = `<div style="padding: 10px; margin-bottom: 15px; text-align: center;">Hi ${firstName},</div>
<div style="padding: 10px; margin-bottom: 15px; text-align: center;">After I show you the best deal globally, do you want to complete the booking yourself or let me do it for you? If you choose me, I'll bring you to the checkout where you insert your payment details yourself?</div>
<div style="display: flex; justify-content: center; gap: 15px; margin-bottom: 15px;">
  <button id="bookMyself" style="background: #FF9800; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; cursor: pointer;">Book myself</button>
  <button id="useAIAgent" style="background: #FF9800; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; cursor: pointer;">Agentic AI booking</button>
</div>`;
              finalHtml = greetingHtml;
            } else {
              // Display message without greeting when customer name is blank
              const greetingHtml = `<div style="padding: 10px; margin-bottom: 15px; text-align: center;">After I show you the best deal globally, do you want to complete the booking yourself or let me do it for you? If you choose me, I'll bring you to the checkout where you insert your payment details yourself?</div>
<div style="display: flex; justify-content: center; gap: 15px; margin-bottom: 15px;">
  <button id="bookMyself" style="background: #FF9800; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; cursor: pointer;">Book myself</button>
  <button id="useAIAgent" style="background: #FF9800; color: white; border: none; padding: 12px 24px; border-radius: 5px; font-weight: bold; cursor: pointer;">Agentic AI booking</button>
</div>`;
              finalHtml = greetingHtml;
            }
            
            // Display greeting immediately
            messageDiv.innerHTML = finalHtml;
            
            // Make the popup take up the full page height after screenshot
            const popup = document.getElementById('booking-ai-popup');
            if (popup) {
              popup.style.height = '100vh';
              popup.style.width = 'calc(100vw - 17px)';
              popup.style.position = 'fixed';
              popup.style.top = '0';
              popup.style.left = '0';
              popup.style.zIndex = '9999';
            }
            
            // Add click event handlers for the buttons
            const bookMyselfBtn = document.getElementById('bookMyself');
            const useAIAgentBtn = document.getElementById('useAIAgent');
            
            if (bookMyselfBtn) {
              bookMyselfBtn.addEventListener('click', () => {
                bookMyselfBtn.style.background = '#4CAF50';
                bookMyselfBtn.textContent = '✓ Book myself';
                if (useAIAgentBtn) {
                  useAIAgentBtn.style.background = '#9E9E9E';
                  useAIAgentBtn.style.cursor = 'not-allowed';
                }
                
                // Add 1 second delay before showing follow-up message
                setTimeout(() => {
                  // Add follow-up message with textboxes
                  const followUpMessage = `<div style="padding: 10px; margin-top: 15px; text-align: center;">Great. Just share full name of the main traveller</div>
<div style="padding: 10px; margin-top: 15px; text-align: center;">
  <div style="margin-bottom: 10px; display: flex; flex-direction: column; align-items: center;">
    <input type="text" id="guestName" placeholder="Full Name" style="width: 100%; max-width: 300px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 10px;">
  </div>
  <button id="saveDetails" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; cursor: pointer;">Save</button>
</div>`;
                  
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
                  const saveDetailsBtn = document.getElementById('saveDetails');
                  
                  // Add click event handler for the save button
                  if (saveDetailsBtn) {
                    saveDetailsBtn.addEventListener('click', () => {
                      // Get the input values
                      const nameInput = document.getElementById('guestName') as HTMLInputElement;
                      const name = nameInput?.value || '';
                      
                      // Simple name validation
                      const isValidName = name.trim().length > 0;
                      
                      if (isValidName) {
                        // Valid name - show checkmark
                        saveDetailsBtn.style.background = '#4CAF50';
                        saveDetailsBtn.textContent = '✓ Saved';
                        
                        // Remove any existing error message
                        const existingError = document.getElementById('emailError');
                        if (existingError) {
                          existingError.remove();
                        }
                        
                        // Display email request message and textbox
                        const emailMessage = document.createElement('div');
                        emailMessage.style.cssText = 'padding: 10px; margin-top: 15px; text-align: center;';
                        emailMessage.textContent = 'Thanks. Let me know which email I send the confirmation to';
                        messageDiv.appendChild(emailMessage);
                        
                        const emailInputDiv = document.createElement('div');
                        emailInputDiv.style.cssText = 'padding: 10px; margin-top: 15px; text-align: center;';
                        emailInputDiv.innerHTML = `
                          <div style="margin-bottom: 10px; display: flex; flex-direction: column; align-items: center;">
                            <input type="email" id="guestEmail" placeholder="Email Address" style="width: 100%; max-width: 300px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 10px;">
                          </div>
                          <button id="saveEmail" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; cursor: pointer;">Save Email</button>
                        `;
                        messageDiv.appendChild(emailInputDiv);
                        
                        // Add click event handler for the save email button
                        const saveEmailBtn = document.getElementById('saveEmail');
                        if (saveEmailBtn) {
                          saveEmailBtn.addEventListener('click', () => {
                            const emailInput = document.getElementById('guestEmail') as HTMLInputElement;
                            const email = emailInput?.value || '';
                            
                            // Simple email validation
                            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                            const isValidEmail = emailRegex.test(email);
                            
                            if (isValidEmail) {
                              // Valid email - show checkmark
                              saveEmailBtn.style.background = '#4CAF50';
                              saveEmailBtn.textContent = '✓ Email Saved';
                              
                              // Remove any existing error message
                              const existingEmailError = document.getElementById('emailError');
                              if (existingEmailError) {
                                existingEmailError.remove();
                              }
                              
                              // Display success message
                              const successMessage = document.createElement('div');
                              successMessage.style.cssText = 'padding: 10px; margin-top: 15px; text-align: center;';
                              successMessage.textContent = 'I have everything I need now. Let me load your results';
                              messageDiv.appendChild(successMessage);
                              
                              // Mark that the ready message has been displayed
                              bookingData.readyMessageDisplayed = true;
                              
                              // Add additional message after 1 second
                              setTimeout(() => {
                                const additionalMessage = document.createElement('div');
                                additionalMessage.style.cssText = 'padding: 10px; margin-top: 15px; text-align: center;';
                                additionalMessage.textContent = 'I will show you the country that offers the best value for your hotel';
                                messageDiv.appendChild(additionalMessage);
                                
                                // Add second additional message after 1 more second
                                setTimeout(() => {
                                  const secondMessage = document.createElement('div');
                                  secondMessage.style.cssText = 'padding: 10px; margin-top: 15px; text-align: center;';
                                  secondMessage.textContent = 'and how much it is better vs Booking.com';
                                  messageDiv.appendChild(secondMessage);
                                  
                                  // Scroll to the bottom to show the newest message
                                  const contentDiv = document.querySelector('.content') as HTMLElement;
                                  if (contentDiv) {
                                    contentDiv.scrollTo({
                                      top: contentDiv.scrollHeight,
                                      behavior: 'smooth'
                                    });
                                    const lastMessage = messageDiv.lastElementChild as HTMLElement;
                                    if (lastMessage) {
                                      lastMessage.scrollIntoView({ 
                                        behavior: 'smooth', 
                                        block: 'end',
                                        inline: 'nearest'
                                      });
                                    }
                                  }
                                }, 1000);
                                
                                // Scroll to the bottom to show the newest message
                                const contentDiv = document.querySelector('.content') as HTMLElement;
                                if (contentDiv) {
                                  contentDiv.scrollTo({
                                    top: contentDiv.scrollHeight,
                                    behavior: 'smooth'
                                  });
                                  const lastMessage = messageDiv.lastElementChild as HTMLElement;
                                  if (lastMessage) {
                                    lastMessage.scrollIntoView({ 
                                      behavior: 'smooth', 
                                      block: 'end',
                                      inline: 'nearest'
                                    });
                                  }
                                }
                              }, 1000);
                            } else {
                              // Invalid email - show error
                              saveEmailBtn.style.background = '#4CAF50';
                              saveEmailBtn.textContent = 'Save Email';
                              
                              // Preserve the entered values
                              if (emailInput) emailInput.value = email;
                              
                              // Display error message
                              const existingEmailError = document.getElementById('emailError');
                              if (!existingEmailError) {
                                const errorMessage = document.createElement('div');
                                errorMessage.id = 'emailError';
                                errorMessage.textContent = 'Invalid email';
                                errorMessage.style.color = '#f44336';
                                errorMessage.style.fontSize = '12px';
                                errorMessage.style.marginTop = '5px';
                                errorMessage.style.textAlign = 'center';
                                
                                // Insert error message after the email input
                                if (emailInput && emailInput.parentNode) {
                                  emailInput.parentNode.insertBefore(errorMessage, emailInput.nextSibling);
                                }
                              }
                            }
                          });
                        }
                        
                        // Scroll to the bottom to show the newest message
                        setTimeout(() => {
                          const contentDiv = document.querySelector('.content') as HTMLElement;
                          if (contentDiv) {
                            contentDiv.scrollTo({
                              top: contentDiv.scrollHeight,
                              behavior: 'smooth'
                            });
                            const lastMessage = messageDiv.lastElementChild as HTMLElement;
                            if (lastMessage) {
                              lastMessage.scrollIntoView({ 
                                behavior: 'smooth', 
                                block: 'end',
                                inline: 'nearest'
                              });
                            }
                          }
                        }, 300);
                      } else {
                        // Invalid name - keep green background and "Save" text
                        saveDetailsBtn.style.background = '#4CAF50';
                        saveDetailsBtn.textContent = 'Save';
                        
                        // Preserve the entered values
                        if (nameInput) nameInput.value = name;
                        
                        // Display error message below name input
                        const existingError = document.getElementById('emailError');
                        if (!existingError) {
                          const errorMessage = document.createElement('div');
                          errorMessage.id = 'emailError';
                          errorMessage.textContent = 'Please enter a name';
                          errorMessage.style.color = '#f44336';
                          errorMessage.style.fontSize = '12px';
                          errorMessage.style.marginTop = '5px';
                          errorMessage.style.textAlign = 'center';
                          
                          // Insert error message after the name input
                          if (nameInput && nameInput.parentNode) {
                            nameInput.parentNode.insertBefore(errorMessage, nameInput.nextSibling);
                          }
                        }
                      }
                    });
                  }
                }, 1000);
              });
            }
            
            if (useAIAgentBtn) {
              useAIAgentBtn.addEventListener('click', () => {
                useAIAgentBtn.style.background = '#4CAF50';
                useAIAgentBtn.textContent = '✓ Agentic AI booking';
                if (bookMyselfBtn) {
                  bookMyselfBtn.style.background = '#9E9E9E';
                  bookMyselfBtn.style.cursor = 'not-allowed';
                }
                
                // Set the flag to indicate AI Agent was clicked
                bookingData.useAiAgentClicked = true;
                
                // Add 1 second delay before showing follow-up message
                setTimeout(() => {
                  // Add follow-up message with textboxes
                  const followUpMessage = `<div style="padding: 10px; margin-top: 15px; text-align: center;">Great. Just share full name of the main traveller</div>
<div style="padding: 10px; margin-top: 15px; text-align: center;">
  <div style="margin-bottom: 10px; display: flex; flex-direction: column; align-items: center;">
    <input type="text" id="guestName" placeholder="Full Name" style="width: 100%; max-width: 300px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 10px;">
  </div>
  <button id="saveDetails" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; cursor: pointer;">Save</button>
</div>`;
                  
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
                  const saveDetailsBtn = document.getElementById('saveDetails');
                  
                  // Add click event handler for the save button
                  if (saveDetailsBtn) {
                    saveDetailsBtn.addEventListener('click', () => {
                      // Get the input values
                      const nameInput = document.getElementById('guestName') as HTMLInputElement;
                      const name = nameInput?.value || '';
                      
                      // Simple name validation
                      const isValidName = name.trim().length > 0;
                      
                      if (isValidName) {
                        // Valid name - show checkmark
                        saveDetailsBtn.style.background = '#4CAF50';
                        saveDetailsBtn.textContent = '✓ Saved';
                        
                        // Remove any existing error message
                        const existingError = document.getElementById('emailError');
                        if (existingError) {
                          existingError.remove();
                        }
                        
                        // Display email request message and textbox
                        const emailMessage = document.createElement('div');
                        emailMessage.style.cssText = 'padding: 10px; margin-top: 15px; text-align: center;';
                        emailMessage.textContent = 'Thanks. Let me know which email I send the confirmation to';
                        messageDiv.appendChild(emailMessage);
                        
                        const emailInputDiv = document.createElement('div');
                        emailInputDiv.style.cssText = 'padding: 10px; margin-top: 15px; text-align: center;';
                        emailInputDiv.innerHTML = `
                          <div style="margin-bottom: 10px; display: flex; flex-direction: column; align-items: center;">
                            <input type="email" id="guestEmail" placeholder="Email Address" style="width: 100%; max-width: 300px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 10px;">
                          </div>
                          <button id="saveEmail" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; cursor: pointer;">Save Email</button>
                        `;
                        messageDiv.appendChild(emailInputDiv);
                        
                        // Add click event handler for the save email button
                        const saveEmailBtn = document.getElementById('saveEmail');
                        if (saveEmailBtn) {
                          saveEmailBtn.addEventListener('click', () => {
                            const emailInput = document.getElementById('guestEmail') as HTMLInputElement;
                            const email = emailInput?.value || '';
                            
                            // Simple email validation
                            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                            const isValidEmail = emailRegex.test(email);
                            
                            if (isValidEmail) {
                              // Valid email - show checkmark
                              saveEmailBtn.style.background = '#4CAF50';
                              saveEmailBtn.textContent = '✓ Email Saved';
                              
                              // Remove any existing error message
                              const existingEmailError = document.getElementById('emailError');
                              if (existingEmailError) {
                                existingEmailError.remove();
                              }
                              
                              // Display success message
                              const successMessage = document.createElement('div');
                              successMessage.style.cssText = 'padding: 10px; margin-top: 15px; text-align: center;';
                              successMessage.textContent = 'I have everything I need now. Let me load your results';
                              messageDiv.appendChild(successMessage);
                              
                              // Mark that the ready message has been displayed
                              bookingData.readyMessageDisplayed = true;
                              
                              // Add additional message after 1 second
                              setTimeout(() => {
                                const additionalMessage = document.createElement('div');
                                additionalMessage.style.cssText = 'padding: 10px; margin-top: 15px; text-align: center;';
                                additionalMessage.textContent = 'I will show you the country that offers the best value for your hotel';
                                messageDiv.appendChild(additionalMessage);
                                
                                // Add second additional message after 1 more second
                                setTimeout(() => {
                                  const secondMessage = document.createElement('div');
                                  secondMessage.style.cssText = 'padding: 10px; margin-top: 15px; text-align: center;';
                                  secondMessage.textContent = 'and how much it is better vs Booking.com';
                                  messageDiv.appendChild(secondMessage);
                                  
                                  // Scroll to the bottom to show the newest message
                                  const contentDiv = document.querySelector('.content') as HTMLElement;
                                  if (contentDiv) {
                                    contentDiv.scrollTo({
                                      top: contentDiv.scrollHeight,
                                      behavior: 'smooth'
                                    });
                                    const lastMessage = messageDiv.lastElementChild as HTMLElement;
                                    if (lastMessage) {
                                      lastMessage.scrollIntoView({ 
                                        behavior: 'smooth', 
                                        block: 'end',
                                        inline: 'nearest'
                                      });
                                    }
                                  }
                                }, 1000);
                                
                                // Scroll to the bottom to show the newest message
                                const contentDiv = document.querySelector('.content') as HTMLElement;
                                if (contentDiv) {
                                  contentDiv.scrollTo({
                                    top: contentDiv.scrollHeight,
                                    behavior: 'smooth'
                                  });
                                  const lastMessage = messageDiv.lastElementChild as HTMLElement;
                                  if (lastMessage) {
                                    lastMessage.scrollIntoView({ 
                                      behavior: 'smooth', 
                                      block: 'end',
                                      inline: 'nearest'
                                    });
                                  }
                                }
                              }, 1000);
                            } else {
                              // Invalid email - show error
                              saveEmailBtn.style.background = '#4CAF50';
                              saveEmailBtn.textContent = 'Save Email';
                              
                              // Preserve the entered values
                              if (emailInput) emailInput.value = email;
                              
                              // Display error message
                              const existingEmailError = document.getElementById('emailError');
                              if (!existingEmailError) {
                                const errorMessage = document.createElement('div');
                                errorMessage.id = 'emailError';
                                errorMessage.textContent = 'Invalid email';
                                errorMessage.style.color = '#f44336';
                                errorMessage.style.fontSize = '12px';
                                errorMessage.style.marginTop = '5px';
                                errorMessage.style.textAlign = 'center';
                                
                                // Insert error message after the email input
                                if (emailInput && emailInput.parentNode) {
                                  emailInput.parentNode.insertBefore(errorMessage, emailInput.nextSibling);
                                }
                              }
                            }
                          });
                        }
                        
                        // Scroll to the bottom to show the newest message
                        setTimeout(() => {
                          const contentDiv = document.querySelector('.content') as HTMLElement;
                          if (contentDiv) {
                            contentDiv.scrollTo({
                              top: contentDiv.scrollHeight,
                              behavior: 'smooth'
                            });
                            const lastMessage = messageDiv.lastElementChild as HTMLElement;
                            if (lastMessage) {
                              lastMessage.scrollIntoView({ 
                                behavior: 'smooth', 
                                block: 'end',
                                inline: 'nearest'
                              });
                            }
                          }
                        }, 300);
                      } else {
                        // Invalid name - keep green background and "Save" text
                        saveDetailsBtn.style.background = '#4CAF50';
                        saveDetailsBtn.textContent = 'Save';
                        
                        // Preserve the entered values
                        if (nameInput) nameInput.value = name;
                        
                        // Display error message below name input
                        const existingError = document.getElementById('emailError');
                        if (!existingError) {
                          const errorMessage = document.createElement('div');
                          errorMessage.id = 'emailError';
                          errorMessage.textContent = 'Please enter a name';
                          errorMessage.style.color = '#f44336';
                          errorMessage.style.fontSize = '12px';
                          errorMessage.style.marginTop = '5px';
                          errorMessage.style.textAlign = 'center';
                          
                          // Insert error message after the name input
                          if (nameInput && nameInput.parentNode) {
                            nameInput.parentNode.insertBefore(errorMessage, nameInput.nextSibling);
                          }
                        }
                      }
                    });
                  }
                }, 1000);
              });
            }
            
            // Make four parallel API calls for pricing data
            const hotelName = encodeURIComponent((answersArray[0]?.answer || '') + ', ' + (answersArray[1]?.answer || ''));
            
            // First API call - Vietnam
            const pricingResponseVN = fetch(`https://autodeal.io/api/prices/VN4?hotelName=${hotelName}&checkInDate=${answersArray[8]?.answer || ''}&checkOutDate=${answersArray[9]?.answer || ''}&useProxy=true&userCountryCode=US`);
            
            // Second API call - Thailand
            const pricingResponseTH = fetch(`https://autodeal.io/api/prices/TH4?hotelName=${hotelName}&checkInDate=${answersArray[8]?.answer || ''}&checkOutDate=${answersArray[9]?.answer || ''}&useProxy=true&userCountryCode=US`);
            
            // Third API call - UK
            const pricingResponseUK = fetch(`https://autodeal.io/api/prices/UK4?hotelName=${hotelName}&checkInDate=${answersArray[8]?.answer || ''}&checkOutDate=${answersArray[9]?.answer || ''}&useProxy=true&userCountryCode=US`);
            
            // Fourth API call - US
            const pricingResponseUS = fetch(`https://autodeal.io/api/prices/US4?hotelName=${hotelName}&checkInDate=${answersArray[8]?.answer || ''}&checkOutDate=${answersArray[9]?.answer || ''}&useProxy=true&userCountryCode=US`);
            
            // Wait for all four API calls to complete with 5 second delay
            const [pricingDataVN, pricingDataTH, pricingDataUK, pricingDataUS] = await Promise.all([
              pricingResponseVN.then(async () => {
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
                return pricingResponseVN.then(response => response.json());
              }),
              pricingResponseTH.then(async () => {
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
                return pricingResponseTH.then(response => response.json());
              }),
              pricingResponseUK.then(async () => {
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
                return pricingResponseUK.then(response => response.json());
              }),
              pricingResponseUS.then(async () => {
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
                return pricingResponseUS.then(response => response.json());
              })
            ]);
            
            console.log('Pricing API response VN:', pricingDataVN);
            console.log('Pricing API response TH:', pricingDataTH);
            console.log('Pricing API response UK:', pricingDataUK);
            console.log('Pricing API response US:', pricingDataUS);
            
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
            
            // Update pricing data in context with the best result
            updatePricingData(bestPricingData);
            
            // Wait for the ready message to be displayed before showing pricing
            await waitForReadyMessage();
            
            // Add a 3-second delay after the ready message is displayed
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Process pricing data and update popup (only if we have valid pricing data)
            if (bestPricingData && bookingData.pricingData.length > 0) {
              // Get the hotel name from answers array index 0
              const hotelName = answersArray[0]?.answer || 'Unknown Hotel';
              
              // Get the country name from the best price data
              const countryName = bookingData.bestPrice?.apiCountryName || 'Unknown Country';
              
              // Calculate the actual savings
              const bookingComPrice = parseFloat(answersArray[13]?.answer || '0'); // This is in GBP
              const bestPriceUSD = bookingData.bestPrice?.totalPrice || 0; // This is in USD
              const bestPriceGBP = bestPriceUSD * 0.74; // Convert USD to GBP (approximate rate)
              const savingsGBP = bookingComPrice - bestPriceGBP; // Both prices now in GBP
              
              // Add best price below the existing content without replacing the input form
              const bestPriceDiv = document.createElement('div');
              bestPriceDiv.style.cssText = 'padding: 10px; margin-bottom: 15px; text-align: center;';
              bestPriceDiv.innerHTML = `The best value for ${hotelName} was found in ${countryName}. It is £${savingsGBP.toFixed(2)} better than on booking.com. Here is the link to book <a href="${bookingData.bestPrice.bookingLink || '#'}" target="_blank" style="color: #007bff; text-decoration: underline;">Book Now</a>`;
              messageDiv.appendChild(bestPriceDiv);
              
              // If user clicked "Agentic AI booking", automatically open the booking link after 1 second
              if (bookingData.useAiAgentClicked && bookingData.bestPrice?.bookingLink) {
                setTimeout(() => {
                  window.open(bookingData.bestPrice.bookingLink, '_blank');
                }, 1000);
              }
              
              // Scroll to the bottom to show the newest message with a longer delay
              setTimeout(() => {
                const contentDiv = document.querySelector('.content') as HTMLElement;
                if (contentDiv) {
                  // Use smooth scrolling for the content div
                  contentDiv.scrollTo({
                    top: contentDiv.scrollHeight,
                    behavior: 'smooth'
                  });
                  // Also try scrolling the message div into view with longer duration
                  const lastMessage = messageDiv.lastElementChild as HTMLElement;
                  if (lastMessage) {
                    lastMessage.scrollIntoView({ 
                      behavior: 'smooth', 
                      block: 'end',
                      inline: 'nearest'
                    });
                  }
                }
              }, 300);
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
        <h1>Zorro Co-pilot</h1>
        <button id="close-popup" class="close-button">×</button>
      </div>
      <div class="content">
        <div class="message">
          <p>Hello, I am your co-pilot for this payment. </p>
        </div>
      </div>
      <div class="footer">
        <button id="screenshotBtn" class="screenshot-button" style="display: none;">Refresh</button>
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
      // Automatically trigger the message and button display when the popup is first displayed
      setTimeout(() => captureFullPageScreenshot(), 3000);
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
  return new Promise((resolve) => {
    const checkReadyMessage = () => {
      if (bookingData.readyMessageDisplayed) {
        resolve();
      } else {
        setTimeout(checkReadyMessage, 100); // Check every 100ms
      }
    };
    checkReadyMessage();
  });
} 