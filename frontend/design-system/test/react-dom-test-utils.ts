/**
 * `react-dom/test-utils` for `npm run design:test`. Testing Library imports it, and uses it only
 * when React has no `act` of its own; React 18.3 has one, so this hands that on.
 */
import React18 from './react';

export const act = React18.act;
