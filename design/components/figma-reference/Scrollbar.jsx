import { Arrow } from './Arrow.jsx';
import { Thumb } from './Thumb.jsx';

// figma node: 1214:1160 Scrollbar (16 variants)
const __venc = (v) => String(v).replace(/[%|=]/g, encodeURIComponent);
const __vkey = (p) => "oS=" + __venc(p.oS) + '|' + "horizontal=" + __venc(p.horizontal) + '|' + "position=" + __venc(p.position);

export function Scrollbar(_p = {}) {
  const props = { ..._p, oS: _p.oS ?? "windows", horizontal: _p.horizontal ?? false, position: _p.position ?? "start" };
  const __body0 = () => (
    <div className={props.className} style={{
      width: 17,
      height: 92,
      backgroundColor: "rgb(241,241,241)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
          position: "absolute",
          left: 5,
          top: 6,
          width: 7,
          height: 7,
        }}>{props.icon1 ?? <Arrow direction={"up"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 5,
          top: 79,
          width: 7,
          height: 7,
        }}>{props.icon2 ?? <Arrow direction={"down"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 2,
          top: 14,
          width: 13,
        }}>{props.icon3 ?? <Thumb horizontal={false} oS={"windows"} hidden={false} />}</div>
    </div>
  );
  const __body1 = () => (
    <div className={props.className} style={{
      width: 15,
      height: 90,
      backgroundColor: "rgb(250,250,250)",
      boxShadow: "inset 1px 0px 0px 0px rgb(232,232,232), inset -1px 0px 0px 0px rgb(240,240,240)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
          position: "absolute",
          left: 4,
          top: 1,
          width: 8,
        }}>{props.icon1 ?? <Thumb horizontal={false} oS={"mac"} hidden={false} />}</div>
    </div>
  );
  const __body2 = () => (
    <div className={props.className} style={{
      width: 92,
      height: 17,
      backgroundColor: "rgb(241,241,241)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
          position: "absolute",
          left: 6,
          top: 5,
          width: 7,
          height: 7,
        }}>{props.icon1 ?? <Arrow direction={"left"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 79,
          top: 5,
          width: 7,
          height: 7,
        }}>{props.icon2 ?? <Arrow direction={"right"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 15,
          top: 2,
          height: 13,
        }}>{props.icon3 ?? <Thumb horizontal={true} oS={"windows"} hidden={false} />}</div>
    </div>
  );
  const __body3 = () => (
    <div className={props.className} style={{
      width: 92,
      height: 15,
      backgroundColor: "rgb(250,250,250)",
      boxShadow: "inset 0px 1px 0px 0px rgb(232,232,232), inset 0px -1px 0px 0px rgb(240,240,240)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
          position: "absolute",
          left: 1,
          top: 4,
          height: 8,
        }}>{props.icon1 ?? <Thumb horizontal={true} oS={"mac"} hidden={false} />}</div>
    </div>
  );
  const __body4 = () => (
    <div className={props.className} style={{
      width: 92,
      height: 17,
      backgroundColor: "rgb(241,241,241)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
        position: "absolute",
        left: 15,
        top: 2,
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        flexWrap: "nowrap",
      }}>
        <div style={{ position: "relative", height: 13, flexShrink: 0 }}>{props.icon1 ?? <Thumb text1={"........"} horizontal={true} oS={"windows"} hidden={true} />}</div>
        <div style={{ position: "relative", height: 13, flexShrink: 0 }}>{props.icon2 ?? <Thumb text1={".. ...................."} horizontal={true} oS={"windows"} hidden={false} />}</div>
      </div>
      <div style={{
          position: "absolute",
          left: 6,
          top: 5,
          width: 7,
          height: 7,
        }}>{props.icon3 ?? <Arrow direction={"left"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 79,
          top: 5,
          width: 7,
          height: 7,
        }}>{props.icon4 ?? <Arrow direction={"right"} variant={"pixelised"} />}</div>
    </div>
  );
  const __body5 = () => (
    <div className={props.className} style={{
      width: 92,
      height: 15,
      backgroundColor: "rgb(250,250,250)",
      boxShadow: "inset 0px 1px 0px 0px rgb(232,232,232), inset 0px -1px 0px 0px rgb(240,240,240)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
        position: "absolute",
        left: 0,
        top: 4,
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        flexWrap: "nowrap",
      }}>
        <div style={{ position: "relative", height: 8, flexShrink: 0 }}>{props.icon1 ?? <Thumb text1={"........"} horizontal={true} oS={"mac"} hidden={true} />}</div>
        <div style={{ position: "relative", height: 8, flexShrink: 0 }}>{props.icon2 ?? <Thumb text1={".. ...................."} horizontal={true} oS={"mac"} hidden={false} />}</div>
      </div>
    </div>
  );
  const __body6 = () => (
    <div className={props.className} style={{
      width: 92,
      height: 17,
      backgroundColor: "rgb(241,241,241)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
          position: "absolute",
          left: 6,
          top: 5,
          width: 7,
          height: 7,
        }}>{props.icon1 ?? <Arrow direction={"left"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 79,
          top: 5,
          width: 7,
          height: 7,
        }}>{props.icon2 ?? <Arrow direction={"right"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 33,
          top: 2,
          height: 13,
        }}>{props.icon3 ?? <Thumb horizontal={true} oS={"windows"} hidden={false} />}</div>
    </div>
  );
  const __body7 = () => (
    <div className={props.className} style={{
      width: 92,
      height: 15,
      backgroundColor: "rgb(250,250,250)",
      boxShadow: "inset 0px 1px 0px 0px rgb(232,232,232), inset 0px -1px 0px 0px rgb(240,240,240)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
          position: "absolute",
          left: 33,
          top: 4,
          height: 8,
        }}>{props.icon1 ?? <Thumb horizontal={true} oS={"mac"} hidden={false} />}</div>
    </div>
  );
  const __body8 = () => (
    <div className={props.className} style={{
      width: 92,
      height: 17,
      backgroundColor: "rgb(241,241,241)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
          position: "absolute",
          left: 6,
          top: 5,
          width: 7,
          height: 7,
        }}>{props.icon1 ?? <Arrow direction={"left"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 79,
          top: 5,
          width: 7,
          height: 7,
        }}>{props.icon2 ?? <Arrow direction={"right"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 52,
          top: 2,
          height: 13,
        }}>{props.icon3 ?? <Thumb horizontal={true} oS={"windows"} hidden={false} />}</div>
    </div>
  );
  const __body9 = () => (
    <div className={props.className} style={{
      width: 92,
      height: 15,
      backgroundColor: "rgb(250,250,250)",
      boxShadow: "inset 0px 1px 0px 0px rgb(232,232,232), inset 0px -1px 0px 0px rgb(240,240,240)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
          position: "absolute",
          left: 66,
          top: 4,
          height: 8,
        }}>{props.icon1 ?? <Thumb horizontal={true} oS={"mac"} hidden={false} />}</div>
    </div>
  );
  const __body10 = () => (
    <div className={props.className} style={{
      width: 17,
      height: 92,
      backgroundColor: "rgb(241,241,241)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
          position: "absolute",
          left: 5,
          top: 6,
          width: 7,
          height: 7,
        }}>{props.icon1 ?? <Arrow direction={"up"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 5,
          top: 79,
          width: 7,
          height: 7,
        }}>{props.icon2 ?? <Arrow direction={"down"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 2,
          top: 33,
          width: 13,
        }}>{props.icon3 ?? <Thumb horizontal={false} oS={"windows"} hidden={false} />}</div>
    </div>
  );
  const __body11 = () => (
    <div className={props.className} style={{
      width: 15,
      height: 90,
      backgroundColor: "rgb(250,250,250)",
      boxShadow: "inset 1px 0px 0px 0px rgb(232,232,232), inset -1px 0px 0px 0px rgb(240,240,240)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
          position: "absolute",
          left: 4,
          top: 32,
          width: 8,
        }}>{props.icon1 ?? <Thumb horizontal={false} oS={"mac"} hidden={false} />}</div>
    </div>
  );
  const __body12 = () => (
    <div className={props.className} style={{
      width: 17,
      height: 92,
      backgroundColor: "rgb(241,241,241)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
          position: "absolute",
          left: 5,
          top: 6,
          width: 7,
          height: 7,
        }}>{props.icon1 ?? <Arrow direction={"up"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 5,
          top: 79,
          width: 7,
          height: 7,
        }}>{props.icon2 ?? <Arrow direction={"down"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 2,
          top: 53,
          width: 13,
        }}>{props.icon3 ?? <Thumb horizontal={false} oS={"windows"} hidden={false} />}</div>
    </div>
  );
  const __body13 = () => (
    <div className={props.className} style={{
      width: 15,
      height: 90,
      backgroundColor: "rgb(250,250,250)",
      boxShadow: "inset 1px 0px 0px 0px rgb(232,232,232), inset -1px 0px 0px 0px rgb(240,240,240)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
          position: "absolute",
          left: 4,
          top: 64,
          width: 8,
        }}>{props.icon1 ?? <Thumb horizontal={false} oS={"mac"} hidden={false} />}</div>
    </div>
  );
  const __body14 = () => (
    <div className={props.className} style={{
      width: 17,
      height: 92,
      backgroundColor: "rgb(241,241,241)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
        position: "absolute",
        left: 2,
        top: 15,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        flexWrap: "nowrap",
      }}>
        <div style={{
          position: "relative",
          width: 13,
          height: 25,
          backgroundColor: "rgb(241,241,241)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "flex-start",
          flexWrap: "nowrap",
          flexShrink: 0,
        }}>
          <span style={{
            position: "relative",
            fontFamily: "Roboto, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
            fontWeight: 400,
            fontSize: 4,
            lineHeight: "100%",
            color: "rgb(0,0,0)",
            flexShrink: 0,
            alignSelf: "stretch",
            whiteSpace: "pre-wrap",
          }}>{"\n"}</span>
        </div>
        <div style={{
          position: "relative",
          width: 13,
          backgroundColor: "rgb(193,193,193)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "flex-start",
          flexWrap: "nowrap",
          flexShrink: 0,
        }}>
          <span style={{
            position: "relative",
            fontFamily: "Roboto, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
            fontWeight: 400,
            fontSize: 4,
            lineHeight: "100%",
            color: "rgb(0,0,0)",
            flexShrink: 0,
            alignSelf: "stretch",
            whiteSpace: "pre-wrap",
          }}>{"\n\n\n\n"}</span>
        </div>
      </div>
      <div style={{
          position: "absolute",
          left: 5,
          top: 6,
          width: 7,
          height: 7,
        }}>{props.icon3 ?? <Arrow direction={"up"} variant={"pixelised"} />}</div>
      <div style={{
          position: "absolute",
          left: 5,
          top: 79,
          width: 7,
          height: 7,
        }}>{props.icon4 ?? <Arrow direction={"down"} variant={"pixelised"} />}</div>
    </div>
  );
  const __body15 = () => (
    <div className={props.className} style={{
      width: 15,
      height: 90,
      backgroundColor: "rgb(250,250,250)",
      boxShadow: "inset 1px 0px 0px 0px rgb(232,232,232), inset -1px 0px 0px 0px rgb(240,240,240)",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
        position: "absolute",
        left: 4,
        top: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        flexWrap: "nowrap",
      }}>
        <div style={{
          position: "relative",
          width: 8,
          height: 25,
          backgroundColor: "rgb(250,250,250)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "flex-start",
          flexWrap: "nowrap",
          flexShrink: 0,
        }}>
          <span style={{
            position: "relative",
            width: 13,
            fontFamily: "Roboto, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
            fontWeight: 400,
            fontSize: 4,
            lineHeight: "100%",
            color: "rgb(0,0,0)",
            flexShrink: 0,
            whiteSpace: "pre-wrap",
          }}>{"\n"}</span>
        </div>
        <div style={{
          position: "relative",
          width: 8,
          borderRadius: 4,
          backgroundColor: "rgb(193,193,193)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "flex-start",
          flexWrap: "nowrap",
          flexShrink: 0,
        }}>
          <span style={{
            position: "relative",
            width: 13,
            fontFamily: "Roboto, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
            fontWeight: 400,
            fontSize: 4,
            lineHeight: "100%",
            color: "rgb(0,0,0)",
            flexShrink: 0,
            whiteSpace: "pre-wrap",
          }}>{"\n\n\n\n"}</span>
        </div>
      </div>
    </div>
  );
  const __impls = {
    // figma: OS=Windows, Horizontal=False, Position=Start
    "oS=windows|horizontal=false|position=start": __body0,
    // figma: OS=Mac, Horizontal=False, Position=Start
    "oS=mac|horizontal=false|position=start": __body1,
    // figma: OS=Windows, Horizontal=True, Position=Start
    "oS=windows|horizontal=true|position=start": __body2,
    // figma: OS=Mac, Horizontal=True, Position=Start
    "oS=mac|horizontal=true|position=start": __body3,
    // figma: OS=Windows, Horizontal=True, Position=Free
    "oS=windows|horizontal=true|position=free": __body4,
    // figma: OS=Mac, Horizontal=True, Position=Free
    "oS=mac|horizontal=true|position=free": __body5,
    // figma: OS=Windows, Horizontal=True, Position=Middle
    "oS=windows|horizontal=true|position=middle": __body6,
    // figma: OS=Mac, Horizontal=True, Position=Middle
    "oS=mac|horizontal=true|position=middle": __body7,
    // figma: OS=Windows, Horizontal=True, Position=End
    "oS=windows|horizontal=true|position=end": __body8,
    // figma: OS=Mac, Horizontal=True, Position=End
    "oS=mac|horizontal=true|position=end": __body9,
    // figma: OS=Windows, Horizontal=False, Position=Middle
    "oS=windows|horizontal=false|position=middle": __body10,
    // figma: OS=Mac, Horizontal=False, Position=Middle
    "oS=mac|horizontal=false|position=middle": __body11,
    // figma: OS=Windows, Horizontal=False, Position=End
    "oS=windows|horizontal=false|position=end": __body12,
    // figma: OS=Mac, Horizontal=False, Position=End
    "oS=mac|horizontal=false|position=end": __body13,
    // figma: OS=Windows, Horizontal=False, Position=Free
    "oS=windows|horizontal=false|position=free": __body14,
    // figma: OS=Mac, Horizontal=False, Position=Free
    "oS=mac|horizontal=false|position=free": __body15,
  };
  return (__impls[__vkey(props)] ?? __body0)();
}
export default Scrollbar;
