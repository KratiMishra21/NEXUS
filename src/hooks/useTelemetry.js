/**
 * @file useTelemetry.js
 * @description Convenience hook that exposes pre-bound tracking functions
 * so components don't need to import SDK enums directly.
 *
 * Person A — Layer 5: UI Dashboard Structure
 */

import { useTelemetry } from "../context/TelemetryContext.jsx";
import { FEATURE_MODULE, JOURNEY } from "../sdk/feature-taxonomy.js";

/**
 * Extended telemetry hook with pre-bound, component-friendly helpers.
 *
 * @returns {object} Tracking functions bound to the Ghost SDK
 *
 * @example
 * function LoanSubmitButton() {
 *   const { trackSuccess, trackFailure } = useFeatureTelemetry(FEATURE_MODULE.LOAN_ORIGINATION);
 *   const handleSubmit = async () => {
 *     try {
 *       await submitLoan();
 *       trackSuccess({ loanType: "personal" });
 *     } catch {
 *       trackFailure({ step: "submit" });
 *     }
 *   };
 * }
 */
export function useFeatureTelemetry(featureModule) {
  const { sdk } = useTelemetry();

  return {
    trackOpen: (metadata) => sdk.trackOpen(featureModule, metadata),
    trackSuccess: (metadata) => sdk.trackSuccess(featureModule, metadata),
    trackFailure: (metadata) => sdk.trackFailure(featureModule, metadata),
  };
}

/**
 * Journey-specific telemetry hook.
 * Manages journeyId state internally — components just call step/complete/drop.
 *
 * @param {string} journeyName - One of JOURNEY values
 * @returns {object} Journey tracking controls
 *
 * @example
 * function LoanApplicationFlow() {
 *   const journey = useJourneyTelemetry(JOURNEY.LOAN_APPLICATION);
 *
 *   useEffect(() => { journey.start(); }, []);
 *
 *   const handleNextStep = async (stepName) => {
 *     await journey.step(stepName);
 *   };
 * }
 */
export function useJourneyTelemetry(journeyName) {
  const { sdk } = useTelemetry();
  let journeyId = null;

  return {
    start: async () => {
      journeyId = await sdk.startJourney(journeyName);
      return journeyId;
    },
    step: (stepName, metadata) => sdk.trackJourneyStep(journeyId, stepName, metadata),
    complete: (metadata) => sdk.completeJourney(journeyId, metadata),
    drop: (reason) => sdk.dropJourney(journeyId, reason),
  };
}

export { FEATURE_MODULE, JOURNEY };
