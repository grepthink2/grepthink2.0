// figma node: 602:10003 month
export function Month(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} style={{
      width: 30,
      height: 20,
      display: "flex",
      flexDirection: "row",
      gap: 10,
      justifyContent: "center",
      alignItems: "center",
      flexWrap: "nowrap",
      position: "relative",
      ...props.style,
    }}>
      <span style={{
        position: "relative",
        fontFamily: "\"Avenir Next LT Pro\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
        fontWeight: 600,
        fontSize: 10,
        textAlign: "center",
        whiteSpace: "nowrap",
        lineHeight: "12px",
        letterSpacing: "1.500px",
        color: "rgb(181,190,198)",
        flexShrink: 0,
      }}>{props.text1 ?? "SAT"}</span>
    </div>
  );
}
export default Month;
