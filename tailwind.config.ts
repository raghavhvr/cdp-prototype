import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand-neutral premium palette. Swap these out when real brand
        // guidelines arrive — every UI color references these tokens.
        brand: {
          bg: "#0a0a0f",        // Page background — near black
          surface: "#13131a",   // Card / panel background
          elevated: "#1c1c26",  // Elevated card (hover, focus)
          border: "#2a2a36",    // Subtle dividers
          text: "#f5f5f7",      // Primary text
          muted: "#9a9aa8",     // Secondary text
          dim: "#5a5a68",       // Tertiary text
          accent: "#d4af37",    // Gold — primary action / highlights
          accentHover: "#e6c14a",
          danger: "#d72631",    // Red — alerts, abandoned cart
          success: "#3ba776",   // Green — converted, positive
          warning: "#f4a73b",   // Amber — caution, suppression
          info: "#4a8fd9",      // Blue — engaged browser
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
