// figma node: 198:26 Toggle - Switch (2 variants)
const __venc = (v) => String(v).replace(/[%|=]/g, encodeURIComponent);
const __vkey = (p) => "state=" + __venc(p.state);

export function ToggleSwitch(_p = {}) {
  const props = { ..._p, showAXLabel: _p.showAXLabel ?? true, state: _p.state ?? "off" };
  const __body0 = () => (
    <div className={props.className} style={{
      width: 64,
      height: 28,
      overflow: "hidden",
      borderRadius: 100,
      backgroundColor: "rgba(60,60,67,0.3)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
        position: "absolute",
        left: 41,
        top: 9,
        width: 21,
        display: "flex",
        flexDirection: "row",
        gap: 10,
        justifyContent: "center",
        alignItems: "center",
        flexWrap: "nowrap",
      }}>
        {props.showAXLabel && (
        <div style={{
          position: "relative",
          width: 10,
          height: 10,
          borderRadius: "50%",
          boxShadow: "inset 0 0 0 1px var(--miscellaneous-toggle-ax-label-off)",
          flexShrink: 0,
        }} />
        )}
      </div>
      <svg width={39} height={24} viewBox="0 0 39 24" fill="none" style={{
        position: "absolute",
        left: 2,
        top: 2,
        width: 39,
        height: 24,
        borderRadius: 100,
        color: "rgb(255,255,255)",
      }}>
        <path d={"M 0 12 C 0 5.373 5.373 0 12 0 L 27 0 C 33.627 0 39 5.373 39 12 C 39 18.627 33.627 24 27 24 L 12 24 C 5.373 24 0 18.627 0 12 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
    </div>
  );
  const __body1 = () => (
    <div className={props.className} style={{
      width: 64,
      overflow: "hidden",
      borderRadius: 100,
      backgroundColor: "var(--accents-green)",
      display: "flex",
      flexDirection: "row",
      padding: "2px 2px 2px 2px",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "nowrap",
      boxSizing: "border-box",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
        position: "relative",
        display: "flex",
        flexDirection: "row",
        gap: 10,
        justifyContent: "center",
        alignItems: "center",
        flexWrap: "nowrap",
        flexGrow: 1,
      }}>
        {props.showAXLabel && (
        <div style={{
          position: "relative",
          width: 1,
          height: 10,
          backgroundColor: "rgb(255,255,255)",
          flexShrink: 0,
        }} />
        )}
      </div>
      <svg width={39} viewBox="0 0 39 24" fill="none" style={{
        position: "relative",
        width: 39,
        borderRadius: 100,
        flexShrink: 0,
        alignSelf: "stretch",
        color: "rgb(255,255,255)",
      }}>
        <path d={"M 0 12 C 0 5.373 5.373 0 12 0 L 27 0 C 33.627 0 39 5.373 39 12 C 39 18.627 33.627 24 27 24 L 12 24 C 5.373 24 0 18.627 0 12 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
    </div>
  );
  const __impls = {
    // figma: State=Off
    "state=off": __body0,
    // figma: State=On
    "state=on": __body1,
  };
  return (__impls[__vkey(props)] ?? __body0)();
}
export default ToggleSwitch;
