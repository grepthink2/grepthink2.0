Decorative product-mock cards that float around the landing hero (team, milestones, TSR ring, roster). Purely visual — render them inside `<Hero decor={…}>`, which hides them from assistive tech.

```jsx
<Hero … decor={<FloatingCards />} />
<FloatCard kind="tsr" submitted={8} total={12} inline still />   // gallery
```

Shell: white, 22px radius, `--gt-mkt-shadow-float`, ±3–4° tilt, 7–9.5s float. Avatar colors come from the shared `AVATAR_COLORS`.
