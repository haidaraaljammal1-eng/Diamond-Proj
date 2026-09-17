export { isDemoSimulationEnabled, shouldSkipRentalMutation } from "./simulation.enabled";
export {
  applyRentalSimulation,
  applyTarsSimulation,
  licenseSimulationResult,
  passportSimulationResult,
  paymentSimulationPhase,
  shouldHoldLicenseStage,
} from "./simulation.utils";
export { DEMO_CUSTOMER, DEMO_LICENSE_VALID, DEMO_PASSPORT_READY, DEMO_PAYMENT_REFERENCE } from "./simulation.fixtures";
export { SimulationButton } from "./components/simulation-button/simulation-button";
export { SimulationChrome } from "./components/simulation-badge/simulation-badge";
export { useDemoSimulation } from "./hooks/use-demo-simulation";
