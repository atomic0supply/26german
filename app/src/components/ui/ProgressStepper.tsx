interface StepItem {
  id: string;
  label: string;
  state?: "done" | "active" | "todo" | "blocked";
  disabled?: boolean;
}

interface ProgressStepperProps {
  steps: StepItem[];
  activeStep: string;
  onStepChange?: (id: string) => void;
}

export const ProgressStepper = ({ steps, activeStep, onStepChange }: ProgressStepperProps) => {
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeStep)
  );

  return (
    <nav className="progress-stepper" aria-label="Progress">
      {steps.map((step, index) => {
        const state = step.state ?? (index < activeIndex ? "done" : index === activeIndex ? "active" : "todo");
        return (
          <button
            key={step.id}
            type="button"
            className={`progress-stepper__step progress-stepper__step--${state}`}
            disabled={step.disabled}
            aria-current={state === "active" ? "step" : undefined}
            onClick={() => onStepChange?.(step.id)}
          >
            <span className="progress-stepper__index">{index + 1}</span>
            <span className="progress-stepper__label">{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
