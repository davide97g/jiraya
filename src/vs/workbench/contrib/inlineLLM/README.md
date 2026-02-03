# Inline LLM – Testing and development

## Quick test (see your code changes)

### 1. One-time setup

From the project root:

```bash
# Install deps, download Electron, first compile (creates out/)
node build/lib/preLaunch.ts
# Or in VS Code: run task "Ensure Prelaunch Dependencies"
```

### 2. Watch for live recompiles

Keep this running so every save recompiles into `out/`:

```bash
npm run watch
```

Or in VS Code: **Terminal → Run Task → "VS Code - Build"** (runs the watch in the background).

### 3. Run the app (“dev” with live code)

**Option A – From terminal**

```bash
./scripts/code.sh
# Windows: scripts\code.bat
```

**Option B – From VS Code**

- Run task **"Run Dev"** (runs `./scripts/code.sh`), or
- **Run and Debug** → choose **"Launch VS Code Internal"** (or **"VS Code (Hot Reload)"** if you use the Vite flow below).

### 4. See your changes

- Edit files under `src/vs/workbench/contrib/inlineLLM/`.
- Save; wait for the watch to finish (“Finished compilation…” in the task output).
- **Restart** the launched app (close the window and run `./scripts/code.sh` or the launch again).
  Workbench code is loaded from `out/` at startup, so a restart is required after recompile.

### 5. Try Inline LLM in the running app

1. **Configure** (required once):
   **File → Preferences → Settings** (or `Cmd/Ctrl + ,`), search for `inlineLLM`:
   - **Inline Llm: Api Base Url** – e.g. `https://api.openai.com`
   - **Inline Llm: Api Key** – your API key

2. **Invoke**:
   - Open a code file, optionally select some text.
   - **Command Palette** (`Cmd/Ctrl + Shift + P`) → “**Inline LLM**”, or
   - Right-click in the editor → “**Inline LLM**”, or
   - Shortcut: **Ctrl+Shift+L** (Mac: **Cmd+Shift+L**).

3. In the zone widget: type a prompt (e.g. “Add a comment”), click **Run**, then **Apply** or **Reject**.

---

## Optional: Hot reload (Vite) for faster iteration

If the Vite-based workbench is set up, you can avoid full restarts for many changes:

1. **Start the Vite dev server** (port 5199):
   ```bash
   cd build/vite && npm run dev
   ```
   Or run task **"Launch Monaco Editor Vite"** (if it starts the workbench Vite app on 5199).

2. **Launch with Hot Reload**:
   **Run and Debug** → **"Launch VS Code Internal (Hot Reload)"** (or compound **"VS Code (Hot Reload)"**).

3. Edit workbench code and save; the app can reload from the dev server without a full restart (depending on what changed).

---

## Summary

| Goal              | Command / task                          |
|-------------------|-----------------------------------------|
| First-time setup  | `node build/lib/preLaunch.ts` or task "Ensure Prelaunch Dependencies" |
| Live recompile    | `npm run watch` or task "VS Code - Build" |
| Run app (dev)     | `./scripts/code.sh` or task "Run Dev" or "Launch VS Code Internal" |
| Test Inline LLM   | Set `inlineLLM.apiBaseUrl` and `inlineLLM.apiKey`, then Cmd/Ctrl+Shift+L or command "Inline LLM" |
| After code change | Wait for watch to compile, then restart the app (or use Hot Reload if available) |
