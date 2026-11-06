import { useEffect } from "react";
import { useRive, useStateMachineInput, type StateMachineInput } from "@rive-app/react-canvas";
import { RuntimeLoader } from "@rive-app/canvas";
import wasm from "@rive-app/canvas/rive.wasm?url";
import wasmFallback from "@rive-app/canvas/rive_fallback.wasm?url";
import { RIVE_STATE_MACHINE, RIVE_STEP_INPUT } from "../../connections/assets";
import styles from "./Guide.module.css";

// The runtime loads from the app bundle, never a CDN: the app works offline and its CSP allows only itself.
RuntimeLoader.setWasmUrl(wasm);
RuntimeLoader.setWasmFallbackUrl(wasmFallback);

// Rive inputs are live objects the runtime reads; setting .value is how a step is chosen.
function setInput(input: StateMachineInput | null, value: number) {
  if (input) input.value = value;
}

/** Plays a connector's guide.riv, moving its state machine to the step the stepper shows. */
export default function RiveGuide({ src, step, label }: { src: string; step: number; label: string }) {
  const { rive, RiveComponent } = useRive({ src, stateMachines: RIVE_STATE_MACHINE, autoplay: true });
  const input = useStateMachineInput(rive, RIVE_STATE_MACHINE, RIVE_STEP_INPUT, step);
  useEffect(() => setInput(input, step), [input, step]);
  return <RiveComponent className={styles.rive} aria-label={label} role="img" />;
}
