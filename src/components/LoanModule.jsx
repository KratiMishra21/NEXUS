/**
 * @file LoanModule.jsx
 * @description Example: how Person A's SDK integrates into an existing component.
 * Shows two patterns:
 *   1. HOC wrapping (zero changes to existing component logic)
 *   2. Manual hook usage (fine-grained control)
 *
 * Person A — Usage example for team reference
 */

import React, { useState } from "react";
import { withFeatureTracking, wrapAPICall } from "../sdk/tracking-wrapper.js";
import { useFeatureTelemetry, useJourneyTelemetry, FEATURE_MODULE, JOURNEY } from "../hooks/useTelemetry.js";

// ─── Pattern 1: HOC Wrapping (recommended for existing components) ─────────────
// Wrap any existing component — NO changes to the component's internal logic needed

function LoanModuleBase() {
  return <div>Loan Module Content</div>;
}

// This one line adds full FEATURE_OPEN / SUCCESS / FAIL tracking:
export const LoanModule = withFeatureTracking(LoanModuleBase, FEATURE_MODULE.LOAN_ORIGINATION);

// ─── Pattern 2: Manual tracking with hooks (for custom granularity) ────────────

export function LoanApplicationForm() {
  const [step, setStep] = useState(0);
  const { trackSuccess, trackFailure } = useFeatureTelemetry(FEATURE_MODULE.LOAN_ORIGINATION);
  const journey = useJourneyTelemetry(JOURNEY.LOAN_APPLICATION);

  const steps = ["PERSONAL_DETAILS", "INCOME_DETAILS", "EMPLOYMENT_DETAILS", "DOCUMENT_UPLOAD", "REVIEW_SUBMIT"];

  const handleStart = async () => {
    await journey.start();
    setStep(0);
  };

  const handleNext = async () => {
    await journey.step(steps[step]);
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      // Final step — complete the journey
      await journey.complete({ loanType: "personal" });
      await trackSuccess({ stepsCompleted: steps.length });
    }
  };

  const handleAbandon = async () => {
    await journey.drop("user_cancelled");
  };

  return (
    <div style={{ padding: "24px" }}>
      <h2>Loan Application — Step {step + 1} of {steps.length}</h2>
      <p style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>
        {steps[step]}
      </p>
      <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
        {step === 0
          ? <button onClick={handleStart}>Start Application</button>
          : <button onClick={handleNext}>Next Step</button>
        }
        <button onClick={handleAbandon} style={{ background: "none" }}>Cancel</button>
      </div>
    </div>
  );
}
