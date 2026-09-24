import { DateActive } from './DateActive.jsx';
import { DateInactive } from './DateInactive.jsx';
import { Icons } from './Icons.jsx';
import { Month } from './Month.jsx';

// figma node: 602:10012 Calendar
export function Calendar(_p = {}) {
  const props = _p;
  return (
    <div className={props.className} style={{
      width: "fit-content",
      overflow: "hidden",
      borderRadius: 8,
      backgroundColor: "rgb(255,255,255)",
      boxShadow: "2px 16px 19px 0px rgba(0,0,0,0.09)",
      display: "flex",
      flexDirection: "column",
      gap: 22,
      padding: "24px 24px 24px 24px",
      alignItems: "flex-start",
      flexWrap: "nowrap",
      boxSizing: "border-box",
      position: "relative",
      ...props.style,
    }}>
      <div style={{
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "nowrap",
        flexShrink: 0,
        alignSelf: "stretch",
      }}>
        <div style={{
            position: "relative",
            width: 16,
            height: 16,
            flexShrink: 0,
          }}>{props.icon1 ?? <Icons icon={"arrow-left"} />}</div>
        <span style={{
          position: "relative",
          fontFamily: "\"Avenir Next LT Pro\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
          fontWeight: 600,
          fontSize: 14,
          textAlign: "center",
          whiteSpace: "nowrap",
          lineHeight: "14px",
          color: "rgb(74,86,96)",
          flexShrink: 0,
        }}>{props.text1 ?? "September 2021"}</span>
        <div style={{
            position: "relative",
            width: 16,
            height: 16,
            flexShrink: 0,
          }}>{props.icon2 ?? <Icons icon={"arrow-right"} />}</div>
      </div>
      <div style={{
        position: "relative",
        display: "flex",
        flexDirection: "row",
        gap: 8,
        alignItems: "flex-start",
        flexWrap: "nowrap",
        flexShrink: 0,
        alignSelf: "stretch",
      }}>
        <div style={{
            position: "relative",
            width: 30,
            height: 20,
            flexShrink: 0,
          }}>{props.icon3 ?? <Month text1={"SAN"} />}</div>
        <div style={{
            position: "relative",
            width: 30,
            height: 20,
            flexShrink: 0,
          }}>{props.icon4 ?? <Month text1={"MON "} />}</div>
        <Month
          style={{
            position: "relative",
            width: 30,
            height: 20,
            flexShrink: 0,
          }}
          text1={"TUE"}
        />
        <Month
          style={{
            position: "relative",
            width: 30,
            height: 20,
            flexShrink: 0,
          }}
          text1={"WED"}
        />
        <Month
          style={{
            position: "relative",
            width: 30,
            height: 20,
            flexShrink: 0,
          }}
          text1={"THU"}
        />
        <Month
          style={{
            position: "relative",
            width: 30,
            height: 20,
            flexShrink: 0,
          }}
          text1={"FRI"}
        />
        <Month style={{
            position: "relative",
            width: 30,
            height: 20,
            flexShrink: 0,
          }} />
      </div>
      <div style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "flex-start",
        flexWrap: "nowrap",
        flexShrink: 0,
        alignSelf: "stretch",
      }}>
        <div style={{
          position: "relative",
          display: "flex",
          flexDirection: "row",
          gap: 8,
          alignItems: "flex-start",
          flexWrap: "nowrap",
          flexShrink: 0,
          alignSelf: "stretch",
        }}>
          <DateInactive style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }} />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"2"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"3"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"4"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"5"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"6"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"7"}
          />
        </div>
        <div style={{
          position: "relative",
          display: "flex",
          flexDirection: "row",
          gap: 8,
          alignItems: "flex-start",
          flexWrap: "nowrap",
          flexShrink: 0,
          alignSelf: "stretch",
        }}>
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"8"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"9"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"10"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"11"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"12"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"13"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"14"}
          />
        </div>
        <div style={{
          position: "relative",
          display: "flex",
          flexDirection: "row",
          gap: 8,
          alignItems: "flex-start",
          flexWrap: "nowrap",
          flexShrink: 0,
          alignSelf: "stretch",
        }}>
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"15"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"16"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"17"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"18"}
          />
          <DateActive style={{ position: "relative", flexShrink: 0 }} />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"20"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"21"}
          />
        </div>
        <div style={{
          position: "relative",
          display: "flex",
          flexDirection: "row",
          gap: 8,
          alignItems: "flex-start",
          flexWrap: "nowrap",
          flexShrink: 0,
          alignSelf: "stretch",
        }}>
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"22"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"23"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"24"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"25"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"26"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"27"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"28"}
          />
        </div>
        <div style={{
          position: "relative",
          display: "flex",
          flexDirection: "row",
          gap: 8,
          alignItems: "flex-start",
          flexWrap: "nowrap",
          flexShrink: 0,
        }}>
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"29"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"30"}
          />
          <DateInactive
            style={{
              position: "relative",
              width: 30,
              height: 30,
              flexShrink: 0,
            }}
            text1={"31"}
          />
        </div>
      </div>
    </div>
  );
}
export default Calendar;
