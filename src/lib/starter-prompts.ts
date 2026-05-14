/**
 * Derive a short set of KB-aware starter prompts + a one-liner intro from the
 * user's persona text. Heuristic match — no extra DB column needed.
 */
export interface KbIntro {
  title: string;
  blurb: string;
  prompts: string[];
}

const PIZZA: KbIntro = {
  title: "Pizza Making Coach",
  blurb:
    "Every major style, dough chemistry, sauce/cheese/topping technique, equipment buying, troubleshooting, recipes — ask anything.",
  prompts: [
    "What style should I try if my home oven maxes at 550°F?",
    "Recommend a beginner-friendly pizza style.",
    "My crust is gummy in the middle — what's wrong?",
    "Compare Neapolitan vs New York vs Detroit.",
  ],
};

const MUSCLE: KbIntro = {
  title: "Muscle Building Coach",
  blurb:
    "Hypertrophy programming, diet for lean gains, evidence-based supplements with doses + costs + time-to-effect. Pragmatic, citation-backed answers.",
  prompts: [
    "I'm a skinny 25yo on a $30/month budget. What supplements should I take?",
    "Recommend a starting routine for a hardgainer.",
    "Does creatine actually work? What dose?",
    "BCAA — worth it if I already hit my protein target?",
  ],
};

const DEFAULT: KbIntro = {
  title: "Knowledge Base",
  blurb: "Answers are grounded in your indexed sources, with clickable citations.",
  prompts: [
    "Summarise the most important ideas in this knowledge base.",
    "I'm new here — where should I start?",
    "Recommend three things I should read next.",
    "What's a common misconception this material clears up?",
  ],
};

export function deriveKbIntro(persona: string | null | undefined): KbIntro {
  const p = (persona || "").toLowerCase();
  if (/(pizza|neapolitan|dough|oven)/.test(p)) return PIZZA;
  if (/(hypertroph|muscle|lifter|supplement|creatine|protein|hardgainer)/.test(p)) return MUSCLE;
  return DEFAULT;
}
