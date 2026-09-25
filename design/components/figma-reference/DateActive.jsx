import { DateInactive } from './DateInactive.jsx';

// figma node: 602:10010 Date/active
export function DateActive(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} style={{
      width: "fit-content",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      flexWrap: "nowrap",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
          position: "relative",
          height: 30,
          flexShrink: 0,
          alignSelf: "stretch",
          width: "auto",
        }}>{props.icon1 ?? <DateInactive text1={"19"} />}</div>
    </div>
  );
}
export default DateActive;
