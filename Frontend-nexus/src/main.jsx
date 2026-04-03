

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { TelemetryProvider } from "./context/TelemetryContext.jsx";

// In real app: get tenantId and consent from your auth system (JWT claims, settings API)
const TENANT_ID = import.meta.env.VITE_TENANT_ID || "demo_tenant_001";
const CONSENT_GRANTED = true; // Pull from user settings in production

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TelemetryProvider tenantId={TENANT_ID} consentGranted={CONSENT_GRANTED}>
      <App />
    </TelemetryProvider>
  </React.StrictMode>
);
