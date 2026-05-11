function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required env var: ${name}. Copy .env.example → .env.local and fill it in.`
    );
  }
  return value;
}

export const env = {
  SUPABASE_URL: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  SUPABASE_ANON_KEY: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  SUPABASE_SERVICE_ROLE_KEY: () => required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  OPENAI_API_KEY: () => required("OPENAI_API_KEY", process.env.OPENAI_API_KEY),
  OPENAI_CHAT_MODEL: () => process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
  OPENAI_EMBED_MODEL: () => process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
  COHERE_API_KEY: () => process.env.COHERE_API_KEY || "",
};
