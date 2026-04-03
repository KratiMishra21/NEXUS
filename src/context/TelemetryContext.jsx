/**
 * @file TelemetryContext.jsx
 * @description React Context that makes the Ghost SDK available throughout
 * the component tree without prop drilling.
 *
 * Usage:
 *   1. Wrap your app in <TelemetryProvider> in main.jsx
 *   2. Use the useTelemetry() hook in any component
 *
 * Person A — Layer 5: UI Dashboard Structure
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import GhostSDK from "../sdk/ghost-sdk.js";
import { CHANNEL } from "../sdk/feature-taxonomy.js";
import { installRouteTracker } from "../sdk/tracking-wrapper.jsx";

// ─── Context ──────────────────────────────────────────────────────────────────

const TelemetryContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {string}  props.tenantId        - Current tenant (will be masked internally)
 * @param {boolean} props.consentGranted  - Telemetry consent from your auth/settings system
 * @param {React.ReactNode} props.children
 */
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Access the Ghost SDK from any component.
 *
 * @returns {{ sdk: typeof GhostSDK, sdkStatus: object }}
 *
 * @example
 * const { sdk } = useTelemetry();
 * await sdk.trackSuccess(FEATURE_MODULE.LOAN_ORIGINATION);
 */
export function useTelemetry() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) {
    throw new Error("useTelemetry must be used within a <TelemetryProvider>");
  }
  return ctx;
}

export default TelemetryContext;
