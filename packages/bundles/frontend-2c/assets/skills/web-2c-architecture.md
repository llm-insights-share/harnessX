# Skill: Consumer Web (2C) Architecture

- Every public page must declare SEO metadata (title, description, canonical, og tags) in design.md.
- Above-the-fold content must not depend on client-only data fetches; prefer SSG/ISR for marketing routes.
- Images use explicit width/height or aspect-ratio to avoid CLS; hero assets must be optimized (WebP/AVIF).
- Third-party scripts (analytics, chat widgets) load after consent and must not block LCP.
- i18n strings live in `src/shared/i18n` or content layer — pages do not embed hard-coded copy for multi-locale sites.
