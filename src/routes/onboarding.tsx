import { createFileRoute } from "@tanstack/react-router";
import Onboarding from "../onboarding/Onboarding";

/** Standalone journey. See src/onboarding/gate.ts for the three integration points. */
export const Route = createFileRoute("/onboarding")({
	component: Onboarding,
});
