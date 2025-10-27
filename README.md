# BidSpark Auctions

## Project info

This repository contains the frontend for the BidSpark auction demo built with Vite, React and TypeScript.

## How to edit and run locally

You can work locally using your preferred IDE. Ensure you have Node.js and npm (or bun/pnpm) installed.

Quick start:

```sh
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Start development server
npm run dev
```

## Technologies used

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Deployment

Build the project and deploy to your preferred static hosting provider (Vercel, Netlify, Cloudflare Pages, or your own server):

```sh
# Build
npm run build

# Preview locally
npm run preview
```

## reCAPTCHA setup

This project supports Google reCAPTCHA (v2 visible checkbox or v3). Add your site key to your frontend environment as:

```
VITE_RECAPTCHA_SITE_KEY=your_site_key_here
```

For production use you should verify tokens server-side with your reCAPTCHA secret before creating or authenticating accounts.
