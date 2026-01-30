# Grepthink 2.0 Frontend

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Styling](#styling)

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Lint code
npm run lint

# Build for production
npm run build
```

## Project Structure

The frontend is organized using a **feature-based architecture** for better scalability and maintainability:

```
src/
├── features/          # Feature modules (auth, app, etc.)
│   ├── auth/
│   │   ├── components/   # Reusable components within auth
│   │   └── pages/        # Auth-related pages (Login, SignUp, etc.)
│   └── app/
│       ├── components/   # Reusable components within app
│       ├── features/     # Sub-features within app
│       └── pages/        # Main app pages
├── pages/             # Shared/global pages (LandingPage, etc.)
└── styles/            # Global styles and design tokens
```

**Key principles:**
- **Features** group related functionality (e.g., authentication, dashboard)
- **Pages** are route-level components
- **Components** are reusable UI elements within a feature
- Each feature is self-contained with its own components and pages

## Styling

We use **SCSS** for styling with a modular approach:

- **Global styles** in `src/styles/` define colors, fonts, and variables
- **Component styles** are co-located with their components (e.g., `Login.scss` next to `Login.tsx`)
- **Design tokens** in `_colors.scss`, `_fonts.scss`, and `_variables.scss` ensure consistency

**Importing styles:**
```scss
// Import global design tokens using ~ for src/ alias
@use '~/styles/colors';
@use '~/styles/variables';
@use '~/styles/fonts';
```

The `~` alias resolves to `src/`, making imports consistent regardless of file depth in the project structure.

