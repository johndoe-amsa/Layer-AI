import { useEffect, useRef, useState } from "react";
import { TASKS, Task } from "./lib/tasks";
import { loadSettings, saveSettings, Settings, DEFAULT_MODEL } from "./lib/settings";
import { streamCompletion } from "./lib/openai";
import { initDesktop, hideWindow, readClipboard, isDesktop } from "./lib/desktop";

/** Hauteur maximale (px) de la zone de texte avant l'apparition du scroll. */
const MAX_TEXTAREA_HEIGHT = 260;

const TASK_ICONS: Record<string, () => JSX.Element> = {
  fix: CheckCircleIcon,
  translate: GlobeIcon,
  rephrase: RefreshIcon,
};

export default function App() {
  const [task, setTask] = useState<Task>(TASKS[0]);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    initDesktop(() => inputRef.current?.focus());
  }, []);

  // Adapte automatiquement la hauteur de la zone de texte à son contenu,
  // dans la limite de MAX_TEXTAREA_HEIGHT. La barre de scroll n'apparaît
  // qu'une fois cette hauteur maximale atteinte.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const full = el.scrollHeight;
    el.style.height = `${Math.min(full, MAX_TEXTAREA_HEIGHT)}px`;
    el.style.overflowY = full > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showSettings) setShowSettings(false);
        else hideWindow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSettings]);

  async function run() {
    if (!input.trim() || busy) return;
    if (!settings.apiKey) {
      setShowSettings(true);
      return;
    }
    setBusy(true);
    setError("");
    setOutput("");
    abortRef.current = new AbortController();
    try {
      await streamCompletion(
        settings.apiKey,
        settings.model || DEFAULT_MODEL,
        [
          { role: "system", content: task.system },
          { role: "user", content: input },
        ],
        (chunk) => setOutput((prev) => prev + chunk),
        abortRef.current.signal,
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function pasteFromClipboard() {
    const text = await readClipboard();
    if (text) {
      setInput(text);
      inputRef.current?.focus();
    }
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      run();
    }
  }

  return (
    <div className="app">
      <header className="header" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <span className="brand-dot" />
          Layer AI
        </div>
        <button className="icon-btn" title="Réglages" onClick={() => setShowSettings(true)}>
          <GearIcon />
        </button>
      </header>

      <nav className="tabs">
        {TASKS.map((t) => {
          const Icon = TASK_ICONS[t.id];
          return (
            <button
              key={t.id}
              className={`tab ${t.id === task.id ? "active" : ""}`}
              onClick={() => {
                setTask(t);
                setOutput("");
                setError("");
              }}
            >
              {Icon && <Icon />}
              {t.label}
            </button>
          );
        })}
      </nav>

      <main className="main">
        <div className="input-zone">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={task.placeholder}
            spellCheck={false}
          />
          <div className="input-actions">
            <button className="ghost-btn" onClick={pasteFromClipboard}>
              <ClipboardIcon />
              Coller
            </button>
            {input && (
              <button className="ghost-btn danger" onClick={() => setInput("")}>
                <TrashIcon />
                Effacer
              </button>
            )}
            {busy ? (
              <button className="primary-btn stop" onClick={stop}>
                <StopIcon />
                Stop
              </button>
            ) : (
              <button className="primary-btn" onClick={run} disabled={!input.trim()}>
                <SendIcon />
                Lancer <kbd>Ctrl ↵</kbd>
              </button>
            )}
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        {(output || busy) && (
          <div className="output-zone">
            <div className="output-text">
              {output}
              {busy && <span className="cursor" />}
            </div>
            {output && !busy && (
              <button className="ghost-btn copy-btn" onClick={copyOutput}>
                <CopyIcon />
                {copied ? "Copié ✓" : "Copier"}
              </button>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        {isDesktop ? (
          <span>
            <kbd>Ctrl Shift Espace</kbd> afficher/masquer · <kbd>Échap</kbd> masquer
          </span>
        ) : (
          <span>Version web · les requêtes partent directement de ton navigateur</span>
        )}
      </footer>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={(s) => {
            setSettings(s);
            saveSettings(s);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function SettingsPanel({
  settings,
  onSave,
  onClose,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h2>Réglages</h2>
        <label>
          Clé API OpenAI
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            autoFocus
          />
        </label>
        <label>
          Modèle
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_MODEL}
          />
        </label>
        <p className="hint">
          La clé est stockée uniquement sur cet appareil (localStorage) et n'est envoyée qu'à
          l'API OpenAI.
        </p>
        <div className="panel-actions">
          <button className="ghost-btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className="primary-btn"
            onClick={() => onSave({ apiKey: apiKey.trim(), model: model.trim() || DEFAULT_MODEL })}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="btn-icon"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <Icon>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </Icon>
  );
}

function GlobeIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Icon>
  );
}

function RefreshIcon() {
  return (
    <Icon>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </Icon>
  );
}

function ClipboardIcon() {
  return (
    <Icon>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <polyline points="9.5 14.5 12 17 14.5 14.5" />
    </Icon>
  );
}

function TrashIcon() {
  return (
    <Icon>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Icon>
  );
}

function SendIcon() {
  return (
    <Icon>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </Icon>
  );
}

function StopIcon() {
  return (
    <Icon>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </Icon>
  );
}

function CopyIcon() {
  return (
    <Icon>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  );
}
