## Aurora Voice Agent

An autonomous calling agent that answers inbound patient calls, captures intent, and books appointments instantly. The experience includes:

- Interactive simulator that reproduces how the AI conducts the call
- Structured appointment storage with a lightweight in-memory store
- Twilio-compatible webhook (`/api/twilio/voice`) for plugging in a real phone number

## Running locally

1. Install dependencies: `npm install`
2. Start the dev server: `npm run dev`
3. Visit [http://localhost:3000](http://localhost:3000) to launch the simulator

## Twilio voice webhook

Point an inbound Twilio number to `POST https://YOUR_DOMAIN/api/twilio/voice`. The flow will gather name → preferred date/time (with natural language parsing) → visit reason, then emit a confirmation prompt and store the booking in memory. Configure an ngrok tunnel or deploy to Vercel for public access.

## Deployment

Use the production command: `vercel deploy --prod --yes --token $VERCEL_TOKEN --name agentic-14847da9`.
