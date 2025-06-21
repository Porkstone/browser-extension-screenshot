# Booking.com AI Assistant Chrome Extension

A Chrome extension that provides an AI chat interface for Booking.com with screenshot capability.

## Features

- Activates on Booking.com booking pages
- Modern AI chat interface using Tailwind CSS
- Full page screenshot functionality
- Built with TypeScript for type safety

## Prerequisites

- Node.js (v14 or higher)
- pnpm (v7 or higher)

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Build the extension:
```bash
pnpm build
```

3. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the `dist` directory

## Development

To watch for changes during development:
```bash
pnpm watch
```

## Usage

1. Navigate to a Booking.com booking page (URL should match `https://secure.booking.com/book*`)
2. Click the extension icon in your browser toolbar
3. Use the "Take Screenshot" button to capture the current page

## Technologies Used

- TypeScript
- Tailwind CSS
- Chrome Extension Manifest V3
- Webpack
- pnpm 

## TDOD
- Remove hardcoded USD => GBP exchange rate conversion
- Test and Fix Logged out journey
