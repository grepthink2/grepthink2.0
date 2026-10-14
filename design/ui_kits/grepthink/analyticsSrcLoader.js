/* Dev fallback: when the compiled _ds_bundle.js predates components/analytics/
   (it regenerates once per turn), transpile the family straight from source into
   the same namespace. Inert as soon as the bundle carries ChartCard. */
window.loadAnalyticsSources = async function loadAnalyticsSources(base) {
  const NS = window.GrepThinkDesignSystem_36e7e3 || (window.GrepThinkDesignSystem_36e7e3 = {});
  if (NS.ChartCard && NS.ChartCardCheck && NS.TEAM_BREAKDOWN_COLUMNS) return NS;
  const order = ['ChartTooltip', 'ChartLegend', 'LivePill', 'DefinitionPopover', 'ChartEmptyState', 'ChartCard', 'UnitToggle',
    'StatTile', 'AnalyticsFilterRow', 'OnTimeMeter', 'SplitBar', 'WeeklyLine', 'TrendLines', 'StackedBars', 'TimelinessBars', 'BarsBySprint', 'BreakdownTable'];
  for (const name of order) {
    let src = await (await fetch(`${base}/components/analytics/${name}.jsx`)).text();
    const needed = [], found = [];
    src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'\.\/[^']+';?[ \t]*$/mg, (m, names) => { needed.push(...names.split(',').map((s) => s.trim()).filter(Boolean)); return ''; });
    src = src.replace(/^import React[^\n]*$/mg, '');
    src = src.replace(/^export\s+(function|const)\s+([A-Za-z_$][\w$]*)/mg, (m, kind, id) => { found.push(id); return `${kind} ${id}`; });
    const prelude = needed.length ? `const {${[...new Set(needed)].join(',')}} = __NS;\n` : '';
    const code = Babel.transform(prelude + src + `\n;Object.assign(__NS, {${found.join(',')}});`, { presets: ['react'] }).code;
    new Function('React', '__NS', code)(window.React, NS);
  }
  return NS;
};

/* Transpile + run an inline <script type="text/babel-deferred"> after the sources are in. */
window.runDeferredBabel = function runDeferredBabel() {
  document.querySelectorAll('script[type="text/babel-deferred"]').forEach((s) => {
    new Function(Babel.transform(s.textContent, { presets: ['react'] }).code)();
  });
};
