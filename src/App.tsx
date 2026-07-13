import { useEffect, useMemo, useRef, useState } from "react";
import {
  TASKS,
  Task,
  TRANSLATE_LANGS,
  translateSystem,
  REPHRASE_TONES,
  rephraseSystem,
  ReplyMessage,
  replySystem,
  replyUserMessage,
} from "./lib/tasks";
import {
  loadSettings,
  saveSettings,
  loadPrefs,
  savePrefs,
  Settings,
  MODELS,
  DEFAULT_MODELS,
  FALLBACK_MODEL,
} from "./lib/settings";
import { streamCompletion } from "./lib/openai";
import { diffWords } from "./lib/diff";
import { cleanInput, cleanOutput, normalizeDashes } from "./lib/text";
import { initDesktop, hideWindow, readClipboard, isDesktop } from "./lib/desktop";

/** Hauteur maximale (px) de la zone de texte avant l'apparition du scroll. */
const MAX_TEXTAREA_HEIGHT = 260;

/**
 * Hauteur maximale (px) d'un message de conversation : plus basse que la
 * zone principale pour que plusieurs mails collés restent compacts (le
 * contenu défile à l'intérieur du bloc). Fixe quel que soit le focus : une
 * hauteur qui changerait au blur ferait bouger les boutons situés dessous
 * au moment précis où l'on clique dessus.
 */
const MSG_MAX_HEIGHT = 150;

const TASK_ICONS: Record<string, () => JSX.Element> = {
  fix: CheckCircleIcon,
  translate: GlobeIcon,
  rephrase: RefreshIcon,
  reply: MailIcon,
};

/** Bloc de message de l'onglet « Répondre », identifié pour le rendu React. */
type ThreadMsg = ReplyMessage & { id: number };

/**
 * Collage dans une zone de texte contrôlée : nettoie le contenu avant
 * insertion et laisse le collage natif si rien n'est à nettoyer.
 */
function pasteCleaned(
  e: React.ClipboardEvent<HTMLTextAreaElement>,
  current: string,
  set: (value: string) => void,
) {
  const raw = e.clipboardData.getData("text");
  const cleaned = cleanInput(raw);
  if (cleaned === raw) return;
  e.preventDefault();
  const el = e.currentTarget;
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  set(current.slice(0, start) + cleaned + current.slice(end));
  const caret = start + cleaned.length;
  requestAnimationFrame(() => el.setSelectionRange(caret, caret));
}

export default function App() {
  const [task, setTask] = useState<Task>(
    () => TASKS.find((t) => t.id === loadPrefs().task) ?? TASKS[0],
  );
  const [targetLang, setTargetLang] = useState<string>(() => {
    const code = loadPrefs().targetLang;
    return TRANSLATE_LANGS.some((l) => l.code === code) ? code : TRANSLATE_LANGS[0].code;
  });
  const [tone, setTone] = useState<string>(() => {
    const code = loadPrefs().tone;
    return REPHRASE_TONES.some((t) => t.code === code) ? code : REPHRASE_TONES[0].code;
  });
  const [input, setInput] = useState("");
  // Conversation de l'onglet « Répondre », du plus récent au plus ancien :
  // le premier bloc est le message auquel répondre.
  const [thread, setThread] = useState<ThreadMsg[]>([{ id: 0, from: "them", text: "" }]);
  const msgIdRef = useRef(1);
  // Menu déroulant de la conversation : ouvert pendant la préparation, replié
  // automatiquement au lancement pour ne garder que la réponse et la consigne.
  const [historyOpen, setHistoryOpen] = useState(true);
  const [output, setOutput] = useState("");
  // Texte effectivement envoyé pour la dernière correction, figé au lancement
  // afin que le diff reste cohérent même si l'entrée est modifiée ensuite.
  const [sourceText, setSourceText] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const outputZoneRef = useRef<HTMLDivElement>(null);
  // Reflète le réglage autoPaste pour le handler d'ouverture (enregistré une
  // seule fois), sans le figer sur une valeur périmée.
  const autoPasteRef = useRef(settings.autoPaste);

  useEffect(() => {
    autoPasteRef.current = settings.autoPaste;
  }, [settings.autoPaste]);

  // Même besoin pour l'onglet courant : le handler d'ouverture (enregistré une
  // seule fois) doit savoir où coller le presse-papier.
  const taskRef = useRef(task.id);
  useEffect(() => {
    taskRef.current = task.id;
  }, [task.id]);

  // Mémorise le dernier onglet, la dernière langue de traduction et le ton.
  useEffect(() => {
    savePrefs({ task: task.id, targetLang, tone });
  }, [task.id, targetLang, tone]);

  useEffect(() => {
    // À l'affichage de la fenêtre (raccourci global), on pré-remplit le champ
    // avec le presse-papier si l'option est active et que son contenu diffère
    // de la saisie en cours, puis on rend le focus.
    initDesktop(async () => {
      if (autoPasteRef.current) {
        const clip = cleanInput(await readClipboard());
        if (clip && taskRef.current === "reply") {
          // En mode Répondre, le presse-papier est très probablement le mail
          // auquel répondre : on remplit le premier bloc de conversation (le
          // plus récent) s'il est libre, sans jamais écraser une saisie.
          setThread((prev) => {
            if (!prev[0] || prev[0].text.trim()) return prev;
            setHistoryOpen(true);
            return [{ ...prev[0], text: clip }, ...prev.slice(1)];
          });
        } else if (clip && clip !== inputRef.current?.value) {
          setInput(clip);
          setOutput("");
          setError("");
        }
      }
      inputRef.current?.focus();
    });
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
    // Texte nettoyé des artefacts de copier-coller (Outlook, Word…) avant
    // envoi et comparaison, pour éviter les espaces parasites.
    const text = cleanInput(input);
    setBusy(true);
    setError("");
    setOutput("");
    setShowDiff(false);
    setSourceText(text);
    // En mode Répondre : on replie la conversation dans son menu déroulant
    // (il ne reste que la réponse et la consigne à l'écran) et on ramène la
    // zone de réponse en vue.
    if (task.id === "reply") {
      if (thread.some((m) => m.text.trim())) setHistoryOpen(false);
      requestAnimationFrame(() =>
        outputZoneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
    abortRef.current = new AbortController();
    try {
      const system =
        task.id === "translate"
          ? translateSystem(
              TRANSLATE_LANGS.find((l) => l.code === targetLang)?.name ??
                TRANSLATE_LANGS[0].name,
            )
          : task.id === "rephrase"
            ? rephraseSystem(tone)
            : task.id === "reply"
              ? replySystem(settings.replyProfile)
              : task.system;
      // Répondre : consigne + conversation structurée. Autres modes : texte
      // délimité, que le modèle doit transformer, pas y répondre.
      const userContent =
        task.id === "reply"
          ? replyUserMessage(
              thread.map(({ from, text: t }) => ({ from, text: cleanInput(t) })),
              text,
            )
          : `<<<\n${text}\n>>>`;
      const model = settings.models[task.id] || DEFAULT_MODELS[task.id] || FALLBACK_MODEL;
      await streamCompletion(
        settings.apiKey,
        model,
        [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        (chunk) => setOutput((prev) => prev + chunk),
        abortRef.current.signal,
      );
      setOutput((prev) => {
        const out = cleanOutput(prev);
        // Pas en traduction : un tiret long peut y être typographiquement
        // correct (dialogues en français).
        return task.id === "translate" ? out : normalizeDashes(out);
      });
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
      setInput(cleanInput(text));
      inputRef.current?.focus();
    }
  }

  // Collage natif (Ctrl/Cmd+V) : on nettoie le contenu avant insertion.
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    pasteCleaned(e, input, setInput);
  }

  // ---- Conversation de l'onglet « Répondre » ----

  function updateMsg(id: number, patch: Partial<ThreadMsg>) {
    setThread((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  // La liste ne descend jamais sous un bloc : supprimer le dernier le vide.
  function removeMsg(id: number) {
    setThread((prev) => {
      const next = prev.filter((m) => m.id !== id);
      return next.length ? next : [{ id: msgIdRef.current++, from: "them", text: "" }];
    });
  }

  // Ajoute un message plus ancien en fin de liste, en alternant l'expéditeur
  // par rapport au bloc précédent : dans un échange, les tours de parole se
  // succèdent.
  function addMsg() {
    setThread((prev) => [
      ...prev,
      {
        id: msgIdRef.current++,
        from: prev[prev.length - 1]?.from === "them" ? "me" : "them",
        text: "",
      },
    ]);
  }

  async function pasteIntoMsg(id: number) {
    const text = cleanInput(await readClipboard());
    if (text) updateMsg(id, { text });
  }

  function resetThread() {
    setThread([{ id: msgIdRef.current++, from: "them", text: "" }]);
    setHistoryOpen(true);
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Réinjecte la sortie comme nouvelle entrée pour enchaîner les traitements
  // (ex. corriger puis reformuler le texte corrigé).
  function reuseOutput() {
    setInput(output);
    setOutput("");
    setError("");
    // La sortie disparaît : on quitte l'affichage des modifications pour ne pas
    // diffuser l'ancien texte source contre une sortie vide (tout en rouge).
    setShowDiff(false);
    inputRef.current?.focus();
  }

  // Envoie la réponse générée dans l'onglet Reformuler pour la retravailler
  // (bouton « Reprendre et reformuler » du mode Répondre).
  function reuseIntoRephrase() {
    const rephrase = TASKS.find((t) => t.id === "rephrase");
    if (!rephrase) return;
    setTask(rephrase);
    setInput(output);
    setOutput("");
    setError("");
    setShowDiff(false);
    inputRef.current?.focus();
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      run();
    }
  }

  // Surlignage des modifications (onglet « Corriger »). Calculé uniquement à la
  // demande, sur le texte source figé et la sortie terminée.
  const diffSegments = useMemo(
    () => (showDiff ? diffWords(sourceText, output) : null),
    [showDiff, sourceText, output],
  );
  // Les seuls changements d'espaces (normalisation typographique) ne comptent
  // pas comme des corrections visibles.
  const hasChanges =
    diffSegments?.some((s) => s.op !== "equal" && !/^\s+$/.test(s.text)) ?? false;

  const filledCount = thread.filter((m) => m.text.trim()).length;

  // Zone de réponse, extraite pour être placée en tête en mode Répondre
  // (la réponse reste ainsi visible sans scroller) et en bas ailleurs.
  const outputZone = (
    <div className="output-zone" ref={outputZoneRef}>
      <div className="output-header">
        {task.id === "fix" && (
          <label className="switch-row">
            <span>Modifications</span>
            <span className="switch">
              <input
                type="checkbox"
                checked={showDiff}
                disabled={!output || busy}
                onChange={(e) => setShowDiff(e.target.checked)}
              />
              <span className="slider" />
            </span>
          </label>
        )}
        <div className="output-actions">
          {/* En mode Répondre, la sortie est un mail : on ne la reprend pas
              comme nouvelle entrée, on l'envoie vers l'onglet Reformuler. */}
          {task.id === "reply" ? (
            <button
              className="ghost-btn"
              onClick={reuseIntoRephrase}
              disabled={!output || busy}
              title="Reprendre cette réponse dans l'onglet Reformuler"
            >
              <RefreshIcon />
              Reprendre et reformuler
            </button>
          ) : (
            <button
              className="ghost-btn"
              onClick={reuseOutput}
              disabled={!output || busy}
              title="Reprendre ce texte comme nouvelle entrée"
            >
              <ReuseIcon />
              Reprendre
            </button>
          )}
          <button
            className="ghost-btn"
            onClick={copyOutput}
            disabled={!output || busy}
          >
            <CopyIcon />
            {copied ? "Copié ✓" : "Copier"}
          </button>
        </div>
      </div>
      {showDiff && diffSegments ? (
        <div className="output-text">
          {!hasChanges && <div className="diff-empty">Aucune correction nécessaire</div>}
          {diffSegments.map((s, k) => {
            // Changements d'espaces seuls : on les affiche sans surlignage
            // (insertion en clair, suppression masquée) pour ne garder en
            // couleur que les vraies modifications de mots.
            const isSpace = /^\s+$/.test(s.text);
            if (s.op === "equal" || (isSpace && s.op === "insert")) {
              return <span key={k}>{s.text}</span>;
            }
            if (isSpace) return null;
            return s.op === "insert" ? (
              <ins key={k} className="diff-ins">
                {s.text}
              </ins>
            ) : (
              <del key={k} className="diff-del">
                {s.text}
              </del>
            );
          })}
        </div>
      ) : (
        <div className="output-text">
          {output}
          {!output && !busy && (
            <div className="output-empty" aria-hidden="true">
              <span className="skeleton-line" />
              <span className="skeleton-line" />
              <span className="skeleton-line" />
            </div>
          )}
          {busy && <span className="cursor" />}
        </div>
      )}
    </div>
  );

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
                if (t.id === task.id) return;
                setTask(t);
                setOutput("");
                setError("");
                setShowDiff(false);
              }}
            >
              {Icon && <Icon />}
              {t.label}
            </button>
          );
        })}
      </nav>

      <main className="main">
        {/* Mode Répondre : la réponse d'abord (toujours visible sans scroller),
            puis la consigne, puis la conversation repliable. */}
        {task.id === "reply" && (
          <>
            {outputZone}
            {error && <div className="error">{error}</div>}
          </>
        )}
        <div className="input-zone">
          {task.id === "translate" && (
            <div className="pill-select">
              <span className="pill-select-label">Traduire vers</span>
              <div className="pill-options">
                {TRANSLATE_LANGS.map((l) => (
                  <button
                    key={l.code}
                    className={`pill ${l.code === targetLang ? "active" : ""}`}
                    onClick={() => setTargetLang(l.code)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {task.id === "rephrase" && (
            <div className="pill-select">
              <span className="pill-select-label">Ton</span>
              <div className="pill-options">
                {REPHRASE_TONES.map((t) => (
                  <button
                    key={t.code}
                    className={`pill ${t.code === tone ? "active" : ""}`}
                    onClick={() => setTone(t.code)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {task.id === "reply" && <span className="pill-select-label">Consigne</span>}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={onPaste}
            onKeyDown={onInputKeyDown}
            placeholder={task.placeholder}
            spellCheck={false}
          />
          <div className="input-actions">
            {input || (task.id === "reply" && thread.some((m) => m.text.trim())) ? (
              <button
                className="ghost-btn danger"
                onClick={() => {
                  setInput("");
                  setOutput("");
                  setError("");
                  setShowDiff(false);
                  if (task.id === "reply") resetThread();
                }}
              >
                <TrashIcon />
                Effacer
              </button>
            ) : (
              <button className="ghost-btn" onClick={pasteFromClipboard}>
                <ClipboardIcon />
                Coller
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

        {task.id !== "reply" && (
          <>
            {error && <div className="error">{error}</div>}
            {outputZone}
          </>
        )}

        {task.id === "reply" && (
          <section className="history">
            <button
              className={`history-toggle ${historyOpen ? "open" : ""}`}
              onClick={() => setHistoryOpen((o) => !o)}
            >
              <ChevronIcon />
              Conversation
              <span className="history-count">
                {filledCount === 0
                  ? "vide"
                  : filledCount === 1
                    ? "1 message"
                    : `${filledCount} messages`}
              </span>
            </button>
            {historyOpen && (
              <>
                <span className="section-hint">
                  Du plus récent au plus ancien : en haut, le message auquel tu réponds.
                  Marque « Moi » tes propres messages : la réponse imitera ta façon
                  d'écrire.
                </span>
                <div className="thread">
                  {thread.map((m, i) => (
                    <div className="msg" key={m.id}>
                      <div className="msg-head">
                        <div className="msg-id">
                          <span
                            className="msg-num"
                            title={`Message ${thread.length - i} de la conversation (1 = plus ancien)`}
                          >
                            {thread.length - i}
                          </span>
                          <div className="pill-options">
                            <button
                              className={`pill ${m.from === "them" ? "active" : ""}`}
                              onClick={() => updateMsg(m.id, { from: "them" })}
                            >
                              Reçu
                            </button>
                            <button
                              className={`pill ${m.from === "me" ? "active" : ""}`}
                              onClick={() => updateMsg(m.id, { from: "me" })}
                            >
                              Moi
                            </button>
                          </div>
                        </div>
                        <div className="msg-tools">
                          <button
                            className="icon-btn"
                            title="Coller le presse-papier dans ce message"
                            onClick={() => pasteIntoMsg(m.id)}
                          >
                            <ClipboardIcon />
                          </button>
                          <button
                            className="icon-btn"
                            title="Supprimer ce message"
                            onClick={() => removeMsg(m.id)}
                            disabled={thread.length === 1 && !m.text}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                      <GrowingTextarea
                        className="msg-text"
                        value={m.text}
                        onValueChange={(v) => updateMsg(m.id, { text: v })}
                        onKeyDown={onInputKeyDown}
                        placeholder={
                          m.from === "them"
                            ? "Colle ici le message reçu…"
                            : "Colle ici ton message…"
                        }
                      />
                    </div>
                  ))}
                  <button className="ghost-btn add-msg" onClick={addMsg}>
                    <PlusIcon />
                    Ajouter un message plus ancien
                  </button>
                </div>
              </>
            )}
          </section>
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

/**
 * Zone de texte contrôlée à hauteur automatique (même comportement que la
 * zone de saisie principale, plafond MSG_MAX_HEIGHT) avec nettoyage du
 * collage. Utilisée pour les messages de la conversation de l'onglet
 * « Répondre ».
 */
function GrowingTextarea({
  value,
  onValueChange,
  ...rest
}: {
  value: string;
  onValueChange: (value: string) => void;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const full = el.scrollHeight;
    el.style.height = `${Math.min(full, MSG_MAX_HEIGHT)}px`;
    el.style.overflowY = full > MSG_MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onPaste={(e) => pasteCleaned(e, value, onValueChange)}
      spellCheck={false}
      {...rest}
    />
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
  const [models, setModels] = useState<Record<string, string>>(settings.models);
  const [autoPaste, setAutoPaste] = useState(settings.autoPaste);
  const [replyProfile, setReplyProfile] = useState(settings.replyProfile);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h2>Réglages</h2>

        <section className="field">
          <label className="field-label" htmlFor="api-key">
            Clé API OpenAI
          </label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            autoFocus
          />
          <p className="field-hint">
            Stockée uniquement sur cet appareil (localStorage). Les requêtes partent
            directement vers l'API OpenAI, sans serveur intermédiaire.
          </p>
        </section>

        <section className="field">
          <span className="field-label">Modèle par mode</span>
          <div className="card">
            {TASKS.map((t) => (
              <div key={t.id} className="model-row">
                <span className="model-mode">{t.label}</span>
                <select
                  value={models[t.id] ?? DEFAULT_MODELS[t.id] ?? FALLBACK_MODEL}
                  onChange={(e) => setModels({ ...models, [t.id]: e.target.value })}
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.id === DEFAULT_MODELS[t.id] ? " · défaut" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>

        <section className="field">
          <label className="field-label" htmlFor="reply-profile">
            E-Mail · à propos de toi
          </label>
          <textarea
            id="reply-profile"
            value={replyProfile}
            onChange={(e) => setReplyProfile(e.target.value)}
            placeholder="Ex. : signe « Thomas », tutoie mes collègues, réponses courtes et directes…"
            spellCheck={false}
          />
          <p className="field-hint">
            Optionnel. Transmis au modèle uniquement dans l'onglet E-Mail, pour la
            signature et ta façon d'écrire.
          </p>
        </section>

        {isDesktop && (
          <section className="field">
            <span className="field-label">Comportement</span>
            <div className="card">
              <label className="option-row">
                <span className="option-text">
                  Coller automatiquement le presse-papier à l'ouverture
                </span>
                <span className="switch">
                  <input
                    type="checkbox"
                    checked={autoPaste}
                    onChange={(e) => setAutoPaste(e.target.checked)}
                  />
                  <span className="slider" />
                </span>
              </label>
            </div>
          </section>
        )}

        <div className="panel-actions">
          <button className="ghost-btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className="primary-btn"
            onClick={() =>
              onSave({ apiKey: apiKey.trim(), models, autoPaste, replyProfile: replyProfile.trim() })
            }
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

function ChevronIcon() {
  return (
    <Icon>
      <polyline points="9 18 15 12 9 6" />
    </Icon>
  );
}

function MailIcon() {
  return (
    <Icon>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </Icon>
  );
}

function PlusIcon() {
  return (
    <Icon>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
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

function ReuseIcon() {
  return (
    <Icon>
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </Icon>
  );
}
