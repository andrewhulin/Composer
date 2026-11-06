import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { formatUsd } from "@composer/engine";
import { actions, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { Button, Icon } from "../primitives";
import { formatTokens } from "../primitives/format";
import styles from "./BudgetWarning.module.css";

/** Asks before a run that would go over budget. Nothing is sent until the designer says go. */
export function BudgetWarning() {
  const w = useProject((s) => s.budgetWarning);
  useEffect(() => {
    if (!w) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") actions.answerBudget(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [w]);
  if (!w) return null;
  return (
    <div className={styles.scrim}>
      <div className={styles.dialog} role="alertdialog" aria-labelledby="budget-title" aria-describedby="budget-text">
        <div className={styles.head}>
          <Icon icon={TriangleAlert} size="sm" />
          <h2 id="budget-title">Over budget</h2>
        </div>
        <p id="budget-text" className={styles.text}>
          {w.message}
        </p>
        <p className={styles.meta}>
          {w.count === 1 ? "1 run" : `${w.count} runs`} · about {formatUsd(w.estimate.estimateUsd)} · {formatTokens(w.estimate.tokens)} tokens
        </p>
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={() => (actions.answerBudget(false), useUi.getState().openSettings("model"))}>
            Change budgets
          </Button>
          <span className={styles.grow} />
          <Button variant="secondary" size="sm" shortcut="esc" onClick={() => actions.answerBudget(false)}>
            Don't run
          </Button>
          <Button variant="primary" size="sm" autoFocus onClick={() => actions.answerBudget(true)}>
            Run anyway
          </Button>
        </div>
      </div>
    </div>
  );
}
