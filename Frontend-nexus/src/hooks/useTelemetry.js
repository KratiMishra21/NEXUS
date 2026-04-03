

import { useTelemetry } from "../context/TelemetryContext.jsx";
import { FEATURE_MODULE, JOURNEY } from "../sdk/feature-taxonomy.js";


export function useFeatureTelemetry(featureModule) {
  const { sdk } = useTelemetry();

  return {
    trackOpen: (metadata) => sdk.trackOpen(featureModule, metadata),
    trackSuccess: (metadata) => sdk.trackSuccess(featureModule, metadata),
    trackFailure: (metadata) => sdk.trackFailure(featureModule, metadata),
  };
}


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
