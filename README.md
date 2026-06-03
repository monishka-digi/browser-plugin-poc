# Grace Project

A Chrome extension paired with a local Express backend that authenticates a user, fetches records, and fills a target web form using the selected record.

## Project Structure

- `backend/`
  - Express API server
  - `src/index.js` starts the server
  - `src/server.js` configures middleware and routes
  - `src/routes/` contains auth and records endpoints
  - `src/docs/swagger.yaml` exposes API documentation
- `frontend/`
  - Chrome extension files
  - `manifest.json` defines the extension
  - `popup.html` extension UI
  - `popup.js` handles authentication, record fetching, storage, and form actions
  - `content/content.js` injects and fills forms in the active page
  - `background/service-worker.js` supports extension background behavior
  - `services/storage.js` and `services/api.js` provide helper functions

## Features

- Login with provider credentials and API key
- Fetch user records from backend API
- Store fetched records in `chrome.storage.local`
- Automatically restore saved records when the extension reopens during an active session
- Select a record and fill a form on the active tab
- Submit filled form data to a backend endpoint

## Backend Setup

1. Open a terminal and navigate to the backend folder:

```bash
cd backend
```

2. Install dependencies:

```bash
npm install
```

3. Run the server:

```bash
npm run dev
```

4. The backend listens on `http://localhost:5000` by default.

### Notes

- The backend uses `dotenv`; create a `.env` file in `backend/` if you need environment-specific settings.
- API docs are available at `http://localhost:5000/api-docs` when the server is running.

## Load the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `frontend/` folder in this project

## Using the Extension

1. Enter the required credentials in the popup:
   - Provider ID
   - Provider Secret
   - API Key
   - Email
2. Click `Login`
3. Click `Fetch Records` to load records from the backend
4. Records will be stored in the extension storage and remain available while the session is active
5. Choose a record from the dropdown
6. Click `Load Record` to inject the data into the active tab
7. Click `Submit Form` to send record payload to the backend and trigger the form submit action

## Storage Behavior

- Credentials are saved in `chrome.storage.local` under `grace_credentials`
- Fetched records are saved under `grace_records`
- The extension restores saved records when reopened during an active token session, avoiding repeated fetches
- Logging out clears both credentials and cached records

## Additional Notes

- The extension is built for Manifest V3
- Required permissions include `storage`, `activeTab`, `scripting`, and `tabs`
- The backend route setup is defined in `backend/src/routes/authRoutes.js` and `backend/src/routes/recordsRoutes.js`

## Troubleshooting

- If the extension does not restore records, verify the session token is still valid and that the backend server is running
- If API requests fail, confirm `backend` is listening on `http://localhost:5000`
- Use the browser DevTools console inside the popup for additional debugging information
