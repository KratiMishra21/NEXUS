/**
 * @file tracking-wrapper.js
 * @description AOP (Aspect-Oriented Programming) Interceptor for InsightOS.
 *
 * Since pure AOP isn't native to JavaScript, this module implements
 * the AOP pattern using:
 *   1. Higher-Order Components (HOC) to wrap React components
 *   2. Function wrapping to intercept service/API calls
 *   3. React Error Boundaries to auto-capture FEATURE_FAIL events
 *
 * This is the "invisible" part — feature owners don't need to manually
 * add tracking; they wrap their component/function ONCE and the SDK
 * handles the rest.
 *
 * Person A — Layer 1: Ghost Instrumentation Layer
 */

import React, { Component, useEffect, useRef } from "react";
import GhostSDK from "./ghost-sdk.js";
import { EVENT_TYPE, FEATURE_MODULE } from "./feature-taxonomy.js";

// ─── HOC: withFeatureTracking ─────────────────────────────────────────────────

/**
 * Higher-Order Component that wraps any React component with automatic
 * FEATURE_OPEN, FEATURE_SUCCESS, and FEATURE_FAIL tracking.
 *
 * Usage:
 *   const TrackedLoanModule = withFeatureTracking(LoanModule, FEATURE_MODULE.LOAN_ORIGINATION);
 *   // Then use <TrackedLoanModule /> anywhere — tracking is automatic.
 *
 * @param {React.ComponentType} WrappedComponent - The component to instrument
 * @param {string} featureModule - One of FEATURE_MODULE values
 * @param {object} [options]
 * @param {string} [options.journeyId]  - Pass if this component is part of a journey
 * @param {string} [options.journeyStep] - The step name within the journey
 * @returns {React.ComponentType} Instrumented component
 */
export function withFeatureTracking(WrappedComponent, featureModule, options = {}) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || "Component";

  /**
   * Error boundary wraps the component to auto-capture FEATURE_FAIL.
   * Class component required — React doesn't support error boundaries as hooks.
   */
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

// ─── Function Interceptor: wrapAPICall ────────────────────────────────────────

/**
 * Wraps an async function (typically a service/API call) to automatically
 * track FEATURE_SUCCESS or FEATURE_FAIL based on promise resolution.
 *
 * Usage:
 *   const trackedSubmitLoan = wrapAPICall(submitLoanApplication, FEATURE_MODULE.LOAN_ORIGINATION);
 *   await trackedSubmitLoan(payload); // Tracking is automatic
 *
 * @param {Function} fn              - Async function to intercept
 * @param {string} featureModule     - Module this call belongs to
 * @param {object} [metadata]        - Static context to attach to every event
 * @returns {Function} Wrapped async function with identical signature
 */
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

// ─── Auto-Discovery: Route-Based Feature Detection ────────────────────────────

/**
 * Maps URL route patterns to FEATURE_MODULE values.
 * Enables automatic feature tracking based on navigation — no manual tagging needed.
 * 
 * Extend this map as new routes are added to the lending platform.
 * 
 * @type {Array<{ pattern: RegExp, module: string }>}
 */
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

/**
 * Resolves the FEATURE_MODULE for the current URL path.
 * Used by the router-level interceptor to auto-tag page-level events.
 *
 * @param {string} pathname - window.location.pathname
 * @returns {string|null} FEATURE_MODULE value or null if unrecognized
 */
export function resolveFeatureFromRoute(pathname) {
  for (const { pattern, module } of ROUTE_FEATURE_MAP) {
    if (pattern.test(pathname)) return module;
  }
  return null;
}

/**
 * Installs a router-level listener that auto-tracks navigation events.
 * Call once in App.jsx after GhostSDK.init().
 *
 * Works with React Router's history API via popstate/pushState interception.
 */
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
