import { useState, type ReactNode } from "react";

// A step-by-step walkthrough: step tabs across the top, one step at a time,
// Back / Next, and Finish on the last step. Steps already reached can be
// revisited from the tabs. Knows nothing about what the steps edit.

export interface WizardStep {
  id: string;
  title: string;
  intro?: ReactNode; // what this step is for, with examples
  render: () => ReactNode;
}

export function Wizard({
  title,
  steps,
  finishLabel,
  busy = "",
  onFinish,
  onCancel,
}: {
  title: string;
  steps: WizardStep[];
  finishLabel: string;
  busy?: string; // shown instead of the buttons' normal state while something runs
  onFinish: () => void;
  onCancel: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [reached, setReached] = useState(0); // the furthest step reached so far
  const step = steps[index];
  const last = index === steps.length - 1;

  const go = (to: number) => {
    setIndex(to);
    setReached((r) => Math.max(r, to));
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="wizard">
      <div className="wizard-head">
        <b>{title}</b>
        <span className="hint">
          Step {index + 1} of {steps.length}
        </span>
        <button onClick={onCancel} disabled={!!busy}>
          Cancel
        </button>
      </div>
      <nav className="wizard-steps">
        {steps.map((s, i) => (
          <button
            key={s.id}
            className={i === index ? "current" : i <= reached ? "done" : undefined}
            disabled={i > reached || !!busy}
            onClick={() => go(i)}
          >
            <span className="step-number">{i + 1}</span> {s.title}
          </button>
        ))}
      </nav>
      <div className="wizard-body">
        <h2>{step.title}</h2>
        {step.intro && <div className="hint wizard-intro">{step.intro}</div>}
        {step.render()}
      </div>
      <div className="wizard-foot">
        <button onClick={() => go(index - 1)} disabled={index === 0 || !!busy}>
          Back
        </button>
        <span className="hint">{busy}</span>
        {last ? (
          <button className="primary" onClick={onFinish} disabled={!!busy}>
            {finishLabel}
          </button>
        ) : (
          <button className="primary" onClick={() => go(index + 1)} disabled={!!busy}>
            Next: {steps[index + 1].title}
          </button>
        )}
      </div>
    </div>
  );
}
