import { useEffect, useState } from "react";
import { Pin, ScanSearch } from "lucide-react";
import type { ClaudeNode } from "@composer/core";
import { loadReview, pinReview, reviewNode, useSkills } from "../../store/skills";
import { Button, Menu, MenuItem, Popover } from "../primitives";
import styles from "./SkillReview.module.css";

/**
 * On-demand skills as actions on a node: run one whole against the latest output and get its
 * answer as a card. "What's off" can be pinned as notes, so the next run answers them.
 */
export function SkillReview({ claude, runId }: { claude: ClaudeNode; runId: string }) {
  const skills = useSkills((s) => s.skills);
  const review = useSkills((s) => s.reviews[claude.id]);
  const reviewing = useSkills((s) => s.reviewing === claude.id);
  const [menu, setMenu] = useState(false);
  const onDemand = skills.filter((s) => s.mode === "on_demand" && s.kind !== "router");

  useEffect(() => {
    void loadReview(claude.id);
  }, [claude.id]);

  if (!onDemand.length && !review) return null;
  const current = review && review.runId === runId;

  return (
    <div className={styles.review}>
      <div className={styles.bar}>
        <span className="caps">Skill review</span>
        <span className={styles.grow} />
        <span className={styles.anchor}>
          <Button variant="secondary" size="sm" icon={ScanSearch} disabled={reviewing} pressed={menu} onClick={() => setMenu(!menu)}>
            {reviewing ? "Reviewing…" : review ? "Review again" : "Review with…"}
          </Button>
          {menu && (
            <Popover padding="sm" className={styles.menu} onDismiss={() => setMenu(false)}>
              <Menu label="On-demand skills">
                {onDemand.map((s) => (
                  <MenuItem key={s.id} hint={s.description} onClick={() => (setMenu(false), void reviewNode(claude.id, s.id))}>
                    {s.name}
                  </MenuItem>
                ))}
              </Menu>
            </Popover>
          )}
        </span>
      </div>
      {review && (
        <article className={styles.card}>
          <header className={styles.cardHead}>
            <strong>{review.skillName}</strong>
            {!current && <span className={styles.meta}>on an earlier run</span>}
          </header>
          <p className={styles.summary}>{review.review.summary}</p>
          <Part title="What's off" items={review.review.whats_off} tone="off" />
          <Part title="Questions to push it" items={review.review.questions} />
          <Part title="One thing to try" items={[review.review.one_thing]} tone="try" />
          <Part title="Working well" items={review.review.working_well} tone="good" />
          {review.review.whats_off.length > 0 && (
            <Button variant="secondary" size="sm" icon={Pin} onClick={() => pinReview(claude.id)}>
              Pin what's off as notes
            </Button>
          )}
        </article>
      )}
    </div>
  );
}

function Part({ title, items, tone }: { title: string; items: string[]; tone?: "off" | "try" | "good" }) {
  if (!items.filter(Boolean).length) return null;
  return (
    <section className={styles.part} data-tone={tone}>
      <span className={styles.partTitle}>{title}</span>
      <ul>
        {items.filter(Boolean).map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </section>
  );
}
