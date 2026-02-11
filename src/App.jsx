import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

function Visualizer({ multiplier, lineCount }) {
  const [magnitudes, setMagnitudes] = useState(new Array(lineCount).fill(0));

  useEffect(() => {
    invoke("start_audio_capture").catch(console.error);

    const setupListener = async () => {
      const unlisten = await listen("audio-data", (event) => {
        const data = event.payload;
        if (!data || !Array.isArray(data)) return;

        // Take a larger portion of the frequency data if user wants more lines
        const usefulData = data.slice(0, Math.min(data.length, lineCount * 4));
        const step = Math.max(1, Math.floor(usefulData.length / lineCount));

        const newMagnitudes = [];
        for (let i = 0; i < lineCount; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += usefulData[i * step + j] || 0;
          }
          const avg = sum / step;
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
  }, [multiplier, lineCount]);

  return (
    <div className="visualizer-container">
      {magnitudes.map((mag, i) => (
        <div
          key={i}
          className="bar"
          style={{
            height: `${Math.max(4, mag)}px`,
            opacity: 0.8 + (mag / 200) * 0.2,
            width: `${Math.max(2, 300 / lineCount)}px`, // Dynamic width
          }}
        />
      ))}
    </div>
  );
}

function Settings({ multiplier, setMultiplier, lineCount, setLineCount }) {
  const [posX, setPosX] = useState(100);
  const [posY, setPosY] = useState(100);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [allWorkspaces, setAllWorkspaces] = useState(false);

  return (
    <div className="settings-panel">
      <h2>Visualizer Settings</h2>

      <div className="settings-group">
        <label>Line Count ({lineCount})</label>
        <input
          type="range"
          min="8"
          max="64"
          step="2"
          value={lineCount}
          onChange={(e) => setLineCount(parseInt(e.target.value))}
        />
      </div>

      <div className="settings-group">
        <label>Sensitivity ({multiplier})</label>
        <input
          type="range"
          min="1"
          max="200"
          value={multiplier}
          onChange={(e) => setMultiplier(parseInt(e.target.value))}
        />
      </div>

      <div className="settings-group">
        <label>Vertical Position</label>
        <input
          type="range"
          min="0"
          max="1200"
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
        <label>Horizontal Position</label>
        <input
          type="range"
          min="0"
          max="2000"
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
            checked={alwaysOnTop}
            onChange={(e) => {
              setAlwaysOnTop(e.target.checked);
              invoke("set_always_on_top", { always: e.target.checked });
            }}
          />
          Keep on top of everything
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
          Show on all Workspaces / Spaces
        </label>
      </div>

      <p className="hint">
        The visualizer window is click-through, so use these sliders to move it.
      </p>
    </div>
  );
}

function App() {
  const [windowLabel, setWindowLabel] = useState("");
  const [multiplier, setMultiplier] = useState(50);
  const [lineCount, setLineCount] = useState(32);

  useEffect(() => {
    setWindowLabel(getCurrentWindow().label);
  }, []);

  if (windowLabel === "main") {
    return <Visualizer multiplier={multiplier} lineCount={lineCount} />;
  } else if (windowLabel === "settings") {
    return (
      <Settings
        multiplier={multiplier}
        setMultiplier={setMultiplier}
        lineCount={lineCount}
        setLineCount={setLineCount}
      />
    );
  }

  return <div className="loading">Initializing...</div>;
}

export default App;
