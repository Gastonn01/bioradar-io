# Bio-Performance Radar 🔵

> Transform your wearable biometrics into shareable radar charts.
> Dark mode · Client-side only · Zero backend.

---

## Quick Start (Local Dev)

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# 3. Open http://localhost:5173
```

---

## Deploy to Vercel (Free, ~5 min)

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → **New Project**
3. Import your repo
4. Leave all settings as default (Vite is auto-detected)
5. Click **Deploy**

Your app will be live at `https://your-project.vercel.app`

---

## Supported CSV Formats

| Device | Export Type | Notes |
|---|---|---|
| **Whoop** | Daily Performance CSV | Settings → Account → Export Data |
| **Oura Ring** | Activity / Readiness CSV | Oura App → Profile → Data Export |
| **Apple Health** | Basic CSV export | Health App → Profile → Export |

> Apple Health XML full parser is on the roadmap.

---

## File Structure

```
bio-performance-radar/
├── index.html          # Entry point
├── vite.config.js      # Vite config
├── package.json
└── src/
    ├── main.jsx        # React mount
    ├── App.jsx         # Main application
    ├── parser.js       # Universal CSV parser (Whoop, Oura, Apple)
    └── index.css       # Global styles + Google Fonts
```

---

## Stack

- **React 18** + **Vite 5**
- **Recharts** — RadarChart
- **html-to-image** — PNG export
- **Google Fonts** — Oswald + Roboto Mono

---

## Customization Tips

- **Colors**: Edit the `METRICS` array in `App.jsx` to change per-metric colors
- **Score thresholds**: Edit `getGrade()` in `App.jsx`
- **Parser logic**: Edit `src/parser.js` to add new devices or fix column names

---

## Privacy

All data processing happens in the browser. No health data is sent to any server.

---

## License

MIT — do whatever you want with it.
