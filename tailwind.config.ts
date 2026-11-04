import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#F5EBDD",
        parchment: "#FBF5EA",
        honey: "#FFBD59",
        honeyDeep: "#F2A73B",
        cocoa: "#76543B",
        cocoaDark: "#4C3423",
        ink: "#252525",
        teal: "#0799AD",
        tealDeep: "#056C7B",
        mist: "#CBD5E1",
        night: "#141313",
        nightSoft: "#1E1C1A",
      },
      fontFamily: {
        sans: [
          "ui-rounded",
          "\"SF Pro Rounded\"",
          "\"Avenir Next\"",
          "\"Segoe UI\"",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        display: [
          "\"Avenir Next\"",
          "\"Segoe UI\"",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "\"SF Mono\"",
          "\"Cascadia Mono\"",
          "\"Roboto Mono\"",
          "Menlo",
          "monospace",
        ],
      },
      boxShadow: {
        pixel: "4px 4px 0 0 rgba(37,37,37,0.9)",
        pixelSm: "2px 2px 0 0 rgba(37,37,37,0.9)",
        pixelCocoa: "4px 4px 0 0 rgba(118,84,59,0.35)",
        panel: "0 22px 60px -24px rgba(37,37,37,0.55)",
        glow: "0 0 26px rgba(255,189,89,0.35)",
      },
      keyframes: {
        floaty: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        popIn: {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        floaty: "floaty 6s ease-in-out infinite",
        fadeUp: "fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both",
        fadeIn: "fadeIn 0.4s ease-out both",
        slideInRight: "slideInRight 0.35s cubic-bezier(0.22,1,0.36,1) both",
        popIn: "popIn 0.28s cubic-bezier(0.22,1,0.36,1) both",
        blink: "blink 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
