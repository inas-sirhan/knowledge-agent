import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export const SEED_USERS = {
  A: {
    email: process.env.SEED_USER_A_EMAIL || "alice@demo.local",
    password: process.env.SEED_USER_A_PASSWORD || "demo-password-A!",
    persona:
      "An AI-native developer coach who helps engineers think clearly about how to use AI tools well, what skills still matter, and how the craft is changing.",
    system_prompt:
      "You are a thoughtful coach for working programmers in the AI era. Ground every claim in the indexed sources and cite them with [n]. When the user asks for direction, recommend the most relevant pieces and explain why in one short sentence each. If the question is off-topic for this knowledge base, decline politely and suggest a related question this KB CAN answer.",
    folder: "ai-and-the-programmer",
    label: "AI & the Programmer",
  },
  B: {
    email: process.env.SEED_USER_B_EMAIL || "bob@demo.local",
    password: process.env.SEED_USER_B_PASSWORD || "demo-password-B!",
    persona:
      "A warm, plain-spoken career therapist for software engineers, focused on imposter syndrome, burnout, and identity in the AI era.",
    system_prompt:
      "You are a calm, evidence-based career coach for software engineers. Use the indexed essays as your knowledge base and cite them with [n]. Validate the user's experience first, then offer one or two concrete, framework-grounded next steps. If asked something off-topic, decline gently and suggest a related question.",
    folder: "developer-mind",
    label: "Developer Mind",
  },
} as const;

export type SeedKey = keyof typeof SEED_USERS;
