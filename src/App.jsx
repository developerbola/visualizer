import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

const BAR_COUNT_LIMIT = 56;

function Visualizer() {
  const [settings, setSettings] = useState({
    multiplier: 100,
    lineCount: 32,
    barWidth: 3,
    barGap: 4,
    isDoubleSided: false,
    barColor: "#ffffff",
  });

  const [magnitudes, setMagnitudes] = useState(new Array(32).fill(0));
  const settingsRef = useRef(settings);

  useEffect(() => {
    const unlistenPromise = listen("settings-update", (event) => {
      setSettings((prev) => ({ ...prev, ...event.payload }));
    });

    return () => {
      unlistenPromise.then((u) => u());
    };
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    setMagnitudes((prev) => {
      const { lineCount } = settings;
      if (prev.length === lineCount) return prev;
      const arr = [...prev];
      if (arr.length < lineCount) {
        return [...arr, ...new Array(lineCount - arr.length).fill(0)];
      } else {
        return arr.slice(0, lineCount);
      }
    });
  }, [settings]);

  useEffect(() => {
    invoke("start_audio_capture").catch(console.error);

    const setupListener = async () => {
      const unlisten = await listen("audio-data", (event) => {
        const data = event.payload;
        if (!data || !Array.isArray(data)) return;

        const { lineCount, multiplier } = settingsRef.current;
        const portion = Math.min(data.length, lineCount * 8);
        const usefulData = data.slice(0, portion);
        const step = Math.max(1, Math.floor(usefulData.length / lineCount));

        const newMagnitudes = [];
        for (let i = 0; i < lineCount; i++) {
          let sum = 0;
          let count = 0;
          for (let j = 0; j < step; j++) {
            const idx = i * step + j;
            if (idx < usefulData.length) {
              sum += usefulData[idx];
              count++;
            }
          }
          const avg = count > 0 ? sum / count : 0;
          const scaled = Math.min(180, avg * multiplier);
          newMagnitudes.push(scaled);
        }
        setMagnitudes(newMagnitudes);
      });
      return unlisten;
    };

    const unlistenPromise = setupListener();
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <div
      className={`visualizer-container ${settings.isDoubleSided ? "double-sided" : ""}`}
      style={{
        gap: `${settings.barGap}px`,
      }}
    >
      {magnitudes.map((mag, i) => (
        <div
          key={i}
          className="bar"
          style={{
            height: `${Math.max(4, mag)}px`,
            opacity: 0.8 + (mag / 200) * 0.2,
            width: `${settings.barWidth}px`,
            backgroundColor: settings.barColor,
            boxShadow: `0 0 8px ${settings.barColor}cc`,
          }}
        />
      ))}
    </div>
  );
}

function Settings() {
  const [settings, setSettings] = useState({
    multiplier: 100,
    lineCount: 32,
    barWidth: 3,
    barGap: 4,
    isDoubleSided: false,
    barColor: "#ffffff",
  });

  const [posX, setPosX] = useState(100);
  const [posY, setPosY] = useState(500);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [allWorkspaces, setAllWorkspaces] = useState(false);

  const updateSetting = (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    emit("settings-update", newSettings);
  };

  return (
    <div className="settings-panel">
      <div
        className="titlebar"
        data-tauri-drag-region
        onMouseDown={(e) => {
          if (e.buttons === 1) getCurrentWindow().startDragging();
        }}
      />

      <div className="settings-content">
        <h2>Visualizer Settings</h2>
        <div className="settings-scroll-container">
          <div className="settings-group">
            <label>Bar Color</label>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input
                type="color"
                value={settings.barColor}
                onChange={(e) => updateSetting("barColor", e.target.value)}
                style={{
                  width: "40px",
                  height: "40px",
                  padding: "0",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                }}
              />
              <span
                style={{
                  fontSize: "12px",
                  fontFamily: "monospace",
                }}
              >
                {settings.barColor.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="settings-group">
            <label>Line Count ({settings.lineCount})</label>
            <input
              type="range"
              min="4"
              max="56"
              step="1"
              value={settings.lineCount}
              onChange={(e) =>
                updateSetting("lineCount", parseInt(e.target.value))
              }
            />
          </div>

          <div className="settings-group">
            <label>Bar Width (px)</label>
            <input
              type="number"
              value={settings.barWidth}
              min="1"
              max="50"
              onChange={(e) =>
                updateSetting("barWidth", parseInt(e.target.value) || 1)
              }
            />
          </div>

          <div className="settings-group">
            <label>Gap between bars (px)</label>
            <input
              type="number"
              value={settings.barGap}
              min="0"
              max="20"
              onChange={(e) =>
                updateSetting("barGap", parseInt(e.target.value) || 0)
              }
            />
          </div>

          <div className="settings-group">
            <label>Sensitivity ( {settings.multiplier} )</label>
            <input
              type="range"
              min="1"
              max="500"
              value={settings.multiplier}
              onChange={(e) =>
                updateSetting("multiplier", parseInt(e.target.value))
              }
            />
          </div>

          <div className="settings-group">
            <label>Vertical Position ( {posY} )</label>
            <input
              type="range"
              min="0"
              max="1440"
              value={posY}
              onChange={(e) => {
                setPosY(e.target.value);
                invoke("update_window_position", {
                  x: parseFloat(posX),
                  y: parseFloat(e.target.value),
                });
              }}
            />
          </div>

          <div className="settings-group">
            <label>Horizontal Position ( {posX} px )</label>
            <input
              type="range"
              min="0"
              max="2560"
              value={posX}
              onChange={(e) => {
                setPosX(e.target.value);
                invoke("update_window_position", {
                  x: parseFloat(e.target.value),
                  y: parseFloat(posY),
                });
              }}
            />
          </div>

          <div className="settings-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={settings.isDoubleSided}
                onChange={(e) =>
                  updateSetting("isDoubleSided", e.target.checked)
                }
              />
              Mirror vertically (Double Sided)
            </label>
          </div>

          <div className="settings-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={alwaysOnTop}
                onChange={(e) => {
                  setAlwaysOnTop(e.target.checked);
                  invoke("set_always_on_top", { always: e.target.checked });
                }}
              />
              Keep on top
            </label>
          </div>

          <div className="settings-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={allWorkspaces}
                onChange={(e) => {
                  setAllWorkspaces(e.target.checked);
                  invoke("set_visible_on_all_workspaces", {
                    visible: e.target.checked,
                  });
                }}
              />
              Show on all Workspaces
            </label>
          </div>
        </div>

        <p className="hint">
          Visualizer is click-through. Use settings to move it.
        </p>
      </div>
    </div>
  );
}

function App() {
  const [windowLabel, setWindowLabel] = useState("");

  useEffect(() => {
    setWindowLabel(getCurrentWindow().label);
  }, []);

  if (windowLabel === "main") {
    return <Visualizer />;
  } else if (windowLabel === "settings") {
    return <Settings />;
  }

  return <div className="loading">Initializing...</div>;
}

export default App;
