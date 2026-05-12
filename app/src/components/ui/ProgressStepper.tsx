import { motion } from "framer-motion";
import { Check, Lock } from "lucide-react";

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
  const doneCount = steps.filter((step, i) => (step.state ?? (i < activeIndex ? "done" : "todo")) === "done").length;
  const progressPct = steps.length > 1 ? (doneCount / (steps.length - 1)) * 100 : 0;

  return (
    <nav className="progress-stepper" aria-label="Progress">
      <div className="progress-stepper__rail" aria-hidden="true">
        <motion.div
          className="progress-stepper__fill"
          initial={false}
          animate={{ width: `${Math.min(100, progressPct)}%` }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <ol className="progress-stepper__items">
        {steps.map((step, index) => {
          const state = step.state ?? (index < activeIndex ? "done" : index === activeIndex ? "active" : "todo");
          const isActive = state === "active";
          return (
            <li key={step.id} className={`progress-stepper__item progress-stepper__item--${state}`}>
              <button
                type="button"
                className={`progress-stepper__step progress-stepper__step--${state}`}
                disabled={step.disabled}
                aria-current={isActive ? "step" : undefined}
                onClick={() => onStepChange?.(step.id)}
              >
                <motion.span
                  className="progress-stepper__index"
                  animate={isActive ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                  transition={{ duration: 1.6, repeat: isActive ? Infinity : 0, ease: "easeInOut" }}
                >
                  {state === "done" ? (
                    <Check size={14} strokeWidth={3} aria-hidden="true" />
                  ) : state === "blocked" ? (
                    <Lock size={12} aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </motion.span>
                <span className="progress-stepper__label">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
