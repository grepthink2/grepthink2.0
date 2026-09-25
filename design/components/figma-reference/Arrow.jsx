// figma node: 1214:1126 Arrow (8 variants)
const __venc = (v) => String(v).replace(/[%|=]/g, encodeURIComponent);
const __vkey = (p) => "direction=" + __venc(p.direction) + '|' + "variant=" + __venc(p.variant);

export function Arrow(_p = {}) {
  const props = { ..._p, direction: _p.direction ?? "up", variant: _p.variant ?? "pixelised" };
  const __body0 = () => (
    <div className={props.className} style={{
      width: 7,
      height: 7,
      position: "relative",
      color: "rgb(80,80,80)",
      ...props.style,
    }}>
      <svg width={7} height={4} viewBox="0 0 7 4" fill="none" style={{
        position: "absolute",
        left: 0,
        top: 1,
        width: 7,
        height: 4,
      }}>
        <path d={"M 7 4 L 0 4 L 0 3 L 1 3 L 1 2 L 2 2 L 2 1 L 3 1 L 3 0 L 4 0 L 4 1 L 5 1 L 5 2 L 6 2 L 6 3 L 7 3 L 7 4 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
    </div>
  );
  const __body1 = () => (
    <div className={props.className} style={{
      width: 7,
      height: 7,
      position: "relative",
      color: "rgb(80,80,80)",
      ...props.style,
    }}>
      <svg width={7} height={4} viewBox="0 0 7 4" fill="none" style={{
        position: "absolute",
        left: 0,
        top: 1,
        width: 7,
        height: 4,
      }}>
        <path d={"M 7 4 L 0 4 L 3.5 0 L 7 4 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
    </div>
  );
  const __body2 = () => (
    <div className={props.className} style={{
      width: 7,
      height: 7,
      position: "relative",
      color: "rgb(80,80,80)",
      ...props.style,
    }}>
      <svg width={7} height={4} viewBox="0 0 7 4" fill="none" style={{
        position: "absolute",
        left: 0,
        top: 2,
        width: 7,
        height: 4,
      }}>
        <path d={"M 0 0 L 7 0 L 7 1 L 6 1 L 6 2 L 5 2 L 5 3 L 4 3 L 4 4 L 3 4 L 3 3 L 2 3 L 2 2 L 1 2 L 1 1 L 0 1 L 0 0 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
    </div>
  );
  const __body3 = () => (
    <div className={props.className} style={{
      width: 7,
      height: 7,
      position: "relative",
      color: "rgb(80,80,80)",
      ...props.style,
    }}>
      <svg width={7} height={4} viewBox="0 0 7 4" fill="none" style={{
        position: "absolute",
        left: 0,
        top: 2,
        width: 7,
        height: 4,
      }}>
        <path d={"M 0 0 L 7 0 L 3.5 4 L 0 0 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
    </div>
  );
  const __body4 = () => (
    <div className={props.className} style={{
      width: 7,
      height: 7,
      position: "relative",
      color: "rgb(80,80,80)",
      ...props.style,
    }}>
      <svg width={4} height={7} viewBox="0 0 4 7" fill="none" style={{
        position: "absolute",
        left: 1,
        top: 0,
        width: 4,
        height: 7,
      }}>
        <path d={"M 4 0 L 4 7 L 3 7 L 3 6 L 2 6 L 2 5 L 1 5 L 1 4 L 0 4 L 0 3 L 1 3 L 1 2 L 2 2 L 2 1 L 3 1 L 3 0 L 4 0 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
    </div>
  );
  const __body5 = () => (
    <div className={props.className} style={{
      width: 7,
      height: 7,
      position: "relative",
      color: "rgb(80,80,80)",
      ...props.style,
    }}>
      <svg width={4} height={7} viewBox="0 0 4 7" fill="none" style={{
        position: "absolute",
        left: 1,
        top: 0,
        width: 4,
        height: 7,
      }}>
        <path d={"M 4 0 L 4 7 L 0 3.5 L 4 0 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
    </div>
  );
  const __body6 = () => (
    <div className={props.className} style={{
      width: 7,
      height: 7,
      position: "relative",
      color: "rgb(80,80,80)",
      ...props.style,
    }}>
      <svg width={4} height={7} viewBox="0 0 4 7" fill="none" style={{
        position: "absolute",
        left: 2,
        top: 0,
        width: 4,
        height: 7,
      }}>
        <path d={"M 0 0 L 0 7 L 1 7 L 1 6 L 2 6 L 2 5 L 3 5 L 3 4 L 4 4 L 4 3 L 3 3 L 3 2 L 2 2 L 2 1 L 1 1 L 1 0 L 0 0 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
    </div>
  );
  const __body7 = () => (
    <div className={props.className} style={{
      width: 7,
      height: 7,
      position: "relative",
      color: "rgb(80,80,80)",
      ...props.style,
    }}>
      <svg width={4} height={7} viewBox="0 0 4 7" fill="none" style={{
        position: "absolute",
        left: 2,
        top: 0,
        width: 4,
        height: 7,
      }}>
        <path d={"M 0 0 L 0 7 L 4 3.5 L 0 0 Z"} fill="currentColor" fillRule="nonzero" />
      </svg>
    </div>
  );
  const __impls = {
    // figma: Direction=Up, Variant=Pixelised
    "direction=up|variant=pixelised": __body0,
    // figma: Direction=Up, Variant=AntiAlias
    "direction=up|variant=antialias": __body1,
    // figma: Direction=Down, Variant=Pixelised
    "direction=down|variant=pixelised": __body2,
    // figma: Direction=Down, Variant=AntiAlias
    "direction=down|variant=antialias": __body3,
    // figma: Direction=Left, Variant=Pixelised
    "direction=left|variant=pixelised": __body4,
    // figma: Direction=Left, Variant=AntiAlias
    "direction=left|variant=antialias": __body5,
    // figma: Direction=Right, Variant=Pixelised
    "direction=right|variant=pixelised": __body6,
    // figma: Direction=Right, Variant=AntiAlias
    "direction=right|variant=antialias": __body7,
  };
  return (__impls[__vkey(props)] ?? __body0)();
}
export default Arrow;
