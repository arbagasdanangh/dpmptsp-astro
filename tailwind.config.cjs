export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        dpmBlue: "#0f4c81",
        dpmYellow: "#facc15",
      },
    },
  },
  plugins: [require('@tailwindcss/line-clamp')],
}
