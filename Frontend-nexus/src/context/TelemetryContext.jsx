

import React, { createContext, useContext, useEffect, useState } from "react";
import GhostSDK from "../sdk/ghost-sdk.js";
import { CHANNEL } from "../sdk/feature-taxonomy.js";
import { installRouteTracker } from "../sdk/tracking-wrapper.jsx";



const TelemetryContext = createContext(null);


export function TelemetryProvider({ tenantId, consentGranted, children }) {
  const [sdkStatus, setSdkStatus] = useState(null);

  useEffect(() => {
    let initialized = false;

    async function bootstrap() {
      await GhostSDK.init({
        tenantId,
        channel: CHANNEL.WEB,
        consentGranted,
        debug: import.meta.env.DEV, // Enable debug logs in development
      });

      installRouteTracker();
      initialized = true;
      setSdkStatus(GhostSDK.getStatus());
    }

    bootstrap();

    return () => {
      if (initialized) GhostSDK.destroy();
    };
  }, [tenantId]); // Re-init on tenant change (e.g., admin switching tenants)

  // Keep consent in sync when parent updates (e.g., user changes settings)
  useEffect(() => {
    GhostSDK.setConsent(consentGranted);
    setSdkStatus(GhostSDK.getStatus());
  }, [consentGranted]);

  return (
    <TelemetryContext.Provider value={{ sdk: GhostSDK, sdkStatus }}>
      {children}
    </TelemetryContext.Provider>
  );
}


export function useTelemetry() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) {
    throw new Error("useTelemetry must be used within a <TelemetryProvider>");
  }
  return ctx;
}

export default TelemetryContext;
