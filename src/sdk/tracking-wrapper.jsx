

import React, { Component, useEffect, useRef } from "react";
import GhostSDK from "./ghost-sdk.js";
import { EVENT_TYPE, FEATURE_MODULE } from "./feature-taxonomy.js";


export function withFeatureTracking(WrappedComponent, featureModule, options = {}) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || "Component";

 
  class TrackingErrorBoundary extends Component {
    constructor(props) {
      super(props);
      this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
      return { hasError: true };
    }

    componentDidCatch(error) {
      GhostSDK.trackFailure(featureModule, {
        errorMessage: error.message?.slice(0, 100), // Truncate to avoid PII in stack traces
        componentName: displayName,
        ...options,
      });
    }

    render() {
      if (this.state.hasError) {
        return (
          <div style={{ padding: "16px", color: "var(--color-text-danger, red)" }}>
            Feature temporarily unavailable.
          </div>
        );
      }
      return this.props.children;
    }
  }

  /**
   * The actual tracking wrapper functional component.
   */
  function TrackedComponent(props) {
    const mountTime = useRef(Date.now());

    // FEATURE_OPEN — fires when component mounts (user navigates to feature)
    useEffect(() => {
      GhostSDK.trackOpen(featureModule, {
        componentName: displayName,
        journeyId: options.journeyId,
        journeyStep: options.journeyStep,
      });

      // FEATURE_SUCCESS — fires when component unmounts cleanly (user completed interaction)
      // A clean unmount after >2s is treated as a successful engagement
      return () => {
        const sessionDuration = Date.now() - mountTime.current;
        if (sessionDuration > 2000) {
          GhostSDK.trackSuccess(featureModule, {
            sessionDurationMs: sessionDuration,
            componentName: displayName,
          });
        }
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
      <TrackingErrorBoundary>
        <WrappedComponent {...props} />
      </TrackingErrorBoundary>
    );
  }

  TrackedComponent.displayName = `Tracked(${displayName})`;
  return TrackedComponent;
}


export function wrapAPICall(fn, featureModule, metadata = {}) {
  return async function intercepted(...args) {
    const startTime = Date.now();
    try {
      const result = await fn(...args);
      await GhostSDK.trackSuccess(featureModule, {
        ...metadata,
        durationMs: Date.now() - startTime,
        functionName: fn.name,
      });
      return result;
    } catch (error) {
      await GhostSDK.trackFailure(featureModule, {
        ...metadata,
        durationMs: Date.now() - startTime,
        functionName: fn.name,
        errorCode: error?.code || error?.status || "UNKNOWN",
        // Note: Never pass error.message directly — it may contain PII
      });
      throw error; // Re-throw so caller's error handling still works
    }
  };
}


export const ROUTE_FEATURE_MAP = [
  { pattern: /\/loans\/apply/,        module: FEATURE_MODULE.LOAN_ORIGINATION },
  { pattern: /\/loans\/review/,       module: FEATURE_MODULE.LOAN_ORIGINATION },
  { pattern: /\/documents/,           module: FEATURE_MODULE.DOCUMENT_MANAGEMENT },
  { pattern: /\/risk/,                module: FEATURE_MODULE.RISK_ASSESSMENT },
  { pattern: /\/compliance/,          module: FEATURE_MODULE.COMPLIANCE_CHECK },
  { pattern: /\/repayment/,           module: FEATURE_MODULE.REPAYMENT_SCHEDULE },
  { pattern: /\/reports/,             module: FEATURE_MODULE.REPORTING_DASHBOARD },
  { pattern: /\/tenants/,             module: FEATURE_MODULE.TENANT_MANAGEMENT },
];


export function resolveFeatureFromRoute(pathname) {
  for (const { pattern, module } of ROUTE_FEATURE_MAP) {
    if (pattern.test(pathname)) return module;
  }
  return null;
}


export function installRouteTracker() {
  const trackRoute = () => {
    const feature = resolveFeatureFromRoute(window.location.pathname);
    if (feature) {
      GhostSDK.capture({
        eventType: EVENT_TYPE.FEATURE_OPEN,
        featureModule: feature,
        metadata: { route: window.location.pathname },
      });
    }
  };

  // Intercept browser back/forward
  window.addEventListener("popstate", trackRoute);

  // Intercept React Router programmatic navigation (pushState)
  const origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    trackRoute();
  };

  // Track initial page load
  trackRoute();
}
