# Grepthink 2.0 Frontend

## Table of Contents

- [Linting & Style Guide](#linting--style-guide-eslint--airbnb)


## Linting & Style Guide (ESLint + Airbnb)

This project uses the **Airbnb JavaScript/React style guide** (including Airbnb’s TypeScript rules) enforced with **ESLint v9**.

### Stack
- ESLint v9 (flat config)
- `eslint-config-airbnb`
- `eslint-config-airbnb-typescript`

### Notes on compatibility
Airbnb’s current ESLint configs officially target ESLint v8. To use them with ESLint v9:
- Legacy configs are loaded via `FlatCompat`
- Dependencies are installed with legacy peer resolution
- `@typescript-eslint/*` is pinned to a compatible major version

The configuration lives in `frontend/eslint.config.mjs`.

### Scope
- `src/**/*.{js,jsx,ts,tsx}` → base Airbnb rules
- `src/**/*.{ts,tsx}` → Airbnb TypeScript rules  
- Type-aware rules are enabled via `parserOptions.project`

### Running lint
From `frontend/`:

- `npm run lint` — checks for lint errors
- `npm run lint -- --fix` — auto-fixes issues that are safely fixable
