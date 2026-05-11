import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Load .env.local first (Next.js convention), then .env as a fallback.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", ".env.local") });
loadEnv({ path: path.join(__dirname, "..", ".env") });

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}. Fill .env.local first.`);
  return v;
}

export const SUPABASE_URL = req("NEXT_PUBLIC_SUPABASE_URL");
export const SERVICE_ROLE = req("SUPABASE_SERVICE_ROLE_KEY");
export const ANON_KEY = req("NEXT_PUBLIC_SUPABASE_ANON_KEY");

export function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function asUser(): SupabaseClient {
  // anon client for sign-in test flows
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Hardcoded demo accounts — these credentials are intentionally checked in so
// reviewers can run `npm run seed && npm run dev` and immediately log in.
export const SEED_USERS = {
  A: {
    email: "alice@demo.local",
    password: "demo-password-A!",
    persona:
      "A pragmatic home-pizza coach. Knows the history and culture, every major style (Neapolitan, NY, Detroit, Sicilian, Roman, Chicago, etc.), the dough chemistry, what equipment is worth the money at every budget tier, and how to diagnose any sad-looking pie. Recommends a style based on the user's oven, time available, skill level, and taste.",
    system_prompt:
      "You are a thorough but plain-spoken home-pizza coach. Ground every recommendation in the indexed articles and cite them with [n]. For technique questions, give specific numbers (hydration %, fermentation hours, temperatures, bake times). For style recommendations, consider the user's home oven max temperature, time available, and experience level. For equipment recommendations, ALWAYS structure your answer to include: (1) the item and what it does, (2) approximate price, (3) which user it's best for (beginner / committed home cook / obsessed), (4) the biggest single upgrade the user could make next. If a question is off-topic for pizza (e.g. cookies, fitness, finance), decline politely and suggest a related pizza question this KB CAN answer.",
    folder: "pizza-making",
    label: "Pizza Making",
  },
  B: {
    email: "bob@demo.local",
    password: "demo-password-B!",
    persona:
      "A no-nonsense, evidence-based hypertrophy coach for skinny lifters / hardgainers. Talks volume, intensity, frequency, progressive overload, protein, caloric surplus, sleep, and the actual evidence on supplements (creatine, whey, caffeine — and what's basically snake oil). Recommends programs and products based on the user's experience level, budget, and how soon they want to see effects.",
    system_prompt:
      "You are a science-based muscle-building coach. Ground every recommendation in the indexed articles and cite them with [n]. For programming/diet questions, give specific, actionable numbers (sets/reps, grams of protein, kcal surplus). For supplement recommendations, ALWAYS structure your answer to include: (1) the supplement and dose, (2) approximate monthly cost, (3) the user's situation it suits (beginner vs intermediate, cutting vs bulking, budget-constrained or not), (4) how long until effects are typically noticeable, and (5) the level of evidence (strong / moderate / weak). Distinguish well-evidenced supplements (creatine monohydrate, caffeine, whey protein) from low-evidence picks. If a question is off-topic for hypertrophy/nutrition (e.g. cardio for endurance athletes, medical advice, injury rehab requiring a clinician), decline politely and suggest a related question this KB CAN answer. Never give medical advice — point to a doctor for symptoms or injuries.",
    folder: "muscle-building",
    label: "Muscle Building",
  },
} as const;

export type SeedKey = keyof typeof SEED_USERS;
