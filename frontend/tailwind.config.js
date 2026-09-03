/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gov: {
          dark: "#0a192f",
          navy: "#0f2744",
          slate: "#1e3a5f",
          blue: "#1d4ed8",
          light: "#f8fafc",
          border: "#cbd5e1",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["SFMono-Regular", "Consolas", "Liberation Mono", "Menlo", "Courier", "monospace"],
      },
    },
  },
  plugins: [],
};
