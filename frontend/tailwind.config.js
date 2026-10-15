/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        app: "#030303",
        surface: "#0a0a0a",
        "surface-elev": "#121212",
        primary: "#f4f4f5",
        secondary: "#a1a1aa",
        muted: "#52525b",
        "border-subtle": "rgba(255,255,255,0.08)",
        "border-focus": "rgba(255,255,255,0.25)",
        mood: {
          "angry-bg": "#2b1615",
          "angry-text": "#e8908a",
          "angry-border": "#4a2422",
          "sad-bg": "#141829",
          "sad-text": "#8a9ae8",
          "sad-border": "#242a4a",
          "anxious-bg": "#292418",
          "anxious-text": "#e8cc8a",
          "anxious-border": "#4a402a",
          "hopeful-bg": "#1a241f",
          "hopeful-text": "#91c7a9",
          "hopeful-border": "#2d4238",
          "neutral-bg": "#18181b",
          "neutral-text": "#a1a1aa",
          "neutral-border": "#27272a",
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', "serif"],
        sans: ['"IBM Plex Sans"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      letterSpacing: {
        widest2: "0.25em",
      },
      transitionDuration: {
        3000: "3000ms",
        4000: "4000ms",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
