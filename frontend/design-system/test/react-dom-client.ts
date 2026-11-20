/**
 * `react-dom/client` for `npm run design:test`: the roots of the React DOM 18 in react-dom.ts. Its
 * UMD build exports them from the main module without the warning the CommonJS entry would give.
 */
import ReactDOM from './react-dom';

export const { createRoot, hydrateRoot } = ReactDOM;
