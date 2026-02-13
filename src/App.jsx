import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";

function Visualizer() {
  const [settings, setSettings] = useState({
    multiplier: 100,
    lineCount: 10,
    barWidth: 2,
    barGap: 12,
    isDoubleSided: true,
    barColor: "#ffffff",
  });

  const [magnitudes, setMagnitudes] = useState(new Array(32).fill(0));
  const settingsRef = useRef(settings);
  const targetsRef = useRef(new Array(32).fill(0));
  const currentsRef = useRef(new Array(32).fill(0));
  const lastRenderedLineCount = useRef(settings.lineCount);

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
        targetsRef.current = newMagnitudes;
      });
      return unlisten;
    };

    const unlistenPromise = setupListener();
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    let rafId;

    const animate = () => {
      const { lineCount } = settingsRef.current;
      const targets = targetsRef.current;
      const currents = currentsRef.current;

      if (targets.length !== lineCount) {
        if (targets.length < lineCount) {
          const diff = lineCount - targets.length;
          for (let k = 0; k < diff; k++) targets.push(0);
        } else {
          targets.length = lineCount;
        }
      }

      if (currents.length !== lineCount) {
        if (currents.length < lineCount) {
          const diff = lineCount - currents.length;
          for (let k = 0; k < diff; k++) currents.push(0);
        } else {
          currents.length = lineCount;
        }
      }

      const newMagnitudes = [];
      let hasVisualChange = false;
      const smoothingFactor = 0.25;

      for (let i = 0; i < lineCount; i++) {
        const target = targets[i] || 0;
        let current = currents[i] || 0;

        const diff = target - current;

        if (Math.abs(diff) > 0.1) {
          current += diff * smoothingFactor;
          hasVisualChange = true;
        } else {
          current = target;
        }

        newMagnitudes[i] = current;
      }

      currentsRef.current = newMagnitudes;

      if (hasVisualChange || lastRenderedLineCount.current !== lineCount) {
        setMagnitudes(newMagnitudes);
        lastRenderedLineCount.current = lineCount;
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
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
            border: ".1px solid #00000020",
          }}
        />
      ))}
    </div>
  );
}

function Settings() {
  const [settings, setSettings] = useState({
    multiplier: 100,
    lineCount: 10,
    barWidth: 2,
    barGap: 12,
    isDoubleSided: true,
    barColor: "#ffffff",
  });

  const [posX, setPosX] = useState(50);
  const [posY, setPosY] = useState(90);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [allWorkspaces, setAllWorkspaces] = useState(true);

  const updateSetting = (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    emit("settings-update", newSettings);
  };

  useEffect(() => {
    invoke("update_window_position", {
      x: parseFloat(posX),
      y: parseFloat(posY),
    });
  }, []);

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
          <div className="flex items-center justify-between">
            <p>Line Count</p> <p>{settings.lineCount}</p>
          </div>
          <Slider defaultValue={[33]} max={100} step={1} />
          <input
            type="range"
            class="custom-range"
            min="4"
            max="31"
            step="1"
            value={settings.lineCount}
            onChange={(e) =>
              updateSetting("lineCount", parseInt(e.target.value))
            }
          />
        </div>

        <div className="settings-group">
          <div className="flex items-center justify-between">
            <p>Bar Width</p> <p>{settings.barWidth}</p>
          </div>
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
          <div className="flex items-center justify-between">
            <p>Gap between bars</p> <p>{settings.barGap}</p>
          </div>
          <input
            type="range"
            class="custom-range"
            min="5"
            max="30"
            step="1"
            value={settings.barGap}
            onChange={(e) =>
              updateSetting("barGap", parseInt(e.target.value) || 0)
            }
          />
        </div>

        <div className="settings-group">
          <div className="flex items-center justify-between">
            <p>Sensitivity</p> <p>{settings.multiplier}</p>
          </div>
          <input
            type="range"
            class="custom-range"
            min="1"
            max="500"
            value={settings.multiplier}
            onChange={(e) =>
              updateSetting("multiplier", parseInt(e.target.value))
            }
          />
        </div>

        <div className="settings-group">
          <div className="flex items-center justify-between">
            <p>Vertical Position</p> <p>{posY}%</p>
          </div>
          <input
            type="range"
            class="custom-range"
            min="0"
            max="100"
            step="0.1"
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
          <div className="flex items-center justify-between">
            <p>Horizontal Position</p> <p>{posX}%</p>
          </div>
          <input
            type="range"
            class="custom-range"
            min="0"
            max="100"
            step="0.1"
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
            <Checkbox
              checked={settings.isDoubleSided}
              onCheckedChange={(e) => updateSetting("isDoubleSided", e)}
            />
            Mirror vertically (Double Sided)
          </label>
        </div>

        <div className="settings-group checkbox-group">
          <label>
            <Checkbox
              checked={alwaysOnTop}
              onCheckedChange={(e) => {
                setAlwaysOnTop(e);
                invoke("set_always_on_top", { always: e });
              }}
            />
            Keep on top
          </label>
        </div>

        <div className="settings-group checkbox-group">
          <label>
            <Checkbox
              checked={allWorkspaces}
              onCheckedChange={(e) => {
                setAllWorkspaces(e);
                invoke("set_visible_on_all_workspaces", {
                  visible: e,
                });
              }}
            />
            Show on all Workspaces
          </label>
        </div>
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
