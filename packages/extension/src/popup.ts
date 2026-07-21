/// <reference path="./types.d.ts" />
(() => {
  const DEFAULT_PORT = 4519;

  const portInput = document.getElementById("port") as HTMLInputElement;
  const tokenInput = document.getElementById("token") as HTMLInputElement;
  const statusEl = document.getElementById("status") as HTMLElement;
  const testBtn = document.getElementById("test") as HTMLButtonElement;
  const toggleBtn = document.getElementById("toggle") as HTMLButtonElement;
  const versionEl = document.getElementById("version") as HTMLElement;
  const fixEl = document.getElementById("fix") as HTMLElement;
  const fixCmdEl = document.getElementById("fix-cmd") as HTMLElement;
  const copyBtn = document.getElementById("copy") as HTMLButtonElement;

  type TabStateResponse = { ok: boolean; enabled?: boolean; error?: string };

  function setStatus(text: string, kind: "ok" | "err" | "info"): void {
    statusEl.textContent = text;
    statusEl.className = "status " + kind;
  }

  /** The exact command that would fix the current error, when there is one. */
  function setFix(command: string | undefined): void {
    if (!command) {
      fixEl.hidden = true;
      fixCmdEl.textContent = "";
      return;
    }
    fixCmdEl.textContent = command;
    fixEl.hidden = false;
  }

  function setEditing(enabled: boolean): void {
    toggleBtn.textContent = enabled ? "Editing" : "Edit";
    toggleBtn.classList.toggle("on", enabled);
  }

  versionEl.textContent = "v" + chrome.runtime.getManifest().version;

  copyBtn.addEventListener("click", () => {
    void navigator.clipboard.writeText(fixCmdEl.textContent ?? "").then(() => {
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy command"), 1200);
    });
  });

  /**
   * `auto` is the check the popup runs on open. Nobody asked for it, so a
   * failure is reported in the neutral tone of a status line, not as the red
   * alarm you get when you press the button yourself.
   */
  function test(auto = false): void {
    setStatus("connecting...", "info");
    const port = Number(portInput.value) || DEFAULT_PORT;
    void chrome.storage.local
      .set({ port, token: tokenInput.value.trim() })
      .then(() => {
        chrome.runtime.sendMessage(
          { kind: "froede-test" } satisfies FroedeRuntimeMessage,
          (response: FroedeTestResponse | undefined) => {
            if (response?.ok) {
              setStatus(`connected - ${response.root ?? "?"}`, "ok");
              setFix(undefined);
            } else {
              setStatus(response?.error ?? "no response", auto ? "info" : "err");
              setFix(response?.fix);
            }
          },
        );
      });
  }

  testBtn.addEventListener("click", () => test());

  toggleBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage(
      { kind: "froede-toggle-tab" } satisfies FroedeRuntimeMessage,
      (response: TabStateResponse | undefined) => {
        if (response?.ok) {
          setEditing(response.enabled === true);
          setStatus(
            response.enabled ? "edit mode ON in this tab" : "edit mode off",
            response.enabled ? "ok" : "info",
          );
        } else {
          setStatus(response?.error ?? "no response", "err");
        }
      },
    );
  });

  void chrome.storage.local
    .get({ port: DEFAULT_PORT, token: "" })
    .then((stored) => {
      portInput.value = String(stored.port ?? DEFAULT_PORT);
      tokenInput.value = String(stored.token ?? "");
      // Opening the popup should answer "is this working?" without a click,
      // but only once there is a token worth testing.
      if (tokenInput.value) test(true);
    });

  // Show the current mode instead of guessing; the popup is rebuilt on every
  // open, so the button would otherwise always read "Edit".
  chrome.runtime.sendMessage(
    { kind: "froede-tab-state" } satisfies FroedeRuntimeMessage,
    (response: TabStateResponse | undefined) => {
      setEditing(response?.ok === true && response.enabled === true);
    },
  );
})();
