/// <reference path="./types.d.ts" />
(() => {
  const DEFAULT_PORT = 4519;

  const portInput = document.getElementById("port") as HTMLInputElement;
  const tokenInput = document.getElementById("token") as HTMLInputElement;
  const statusEl = document.getElementById("status") as HTMLElement;
  const saveBtn = document.getElementById("save") as HTMLButtonElement;
  const testBtn = document.getElementById("test") as HTMLButtonElement;
  const toggleBtn = document.getElementById("toggle") as HTMLButtonElement;
  const fixEl = document.getElementById("fix") as HTMLElement;
  const fixCmdEl = document.getElementById("fix-cmd") as HTMLElement;
  const copyBtn = document.getElementById("copy") as HTMLButtonElement;

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

  copyBtn.addEventListener("click", () => {
    void navigator.clipboard.writeText(fixCmdEl.textContent ?? "").then(() => {
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy command"), 1200);
    });
  });

  chrome.storage.local
    .get({ port: DEFAULT_PORT, token: "" })
    .then((stored) => {
      portInput.value = String(stored.port ?? DEFAULT_PORT);
      tokenInput.value = String(stored.token ?? "");
    });

  saveBtn.addEventListener("click", async () => {
    const port = Number(portInput.value) || DEFAULT_PORT;
    await chrome.storage.local.set({ port, token: tokenInput.value.trim() });
    setStatus("saved", "info");
  });

  testBtn.addEventListener("click", async () => {
    setStatus("connecting...", "info");
    const port = Number(portInput.value) || DEFAULT_PORT;
    await chrome.storage.local.set({ port, token: tokenInput.value.trim() });
    chrome.runtime.sendMessage(
      { kind: "froede-test" } satisfies FroedeRuntimeMessage,
      (response: FroedeTestResponse | undefined) => {
        if (response?.ok) {
          setStatus(`connected - project: ${response.root ?? "?"}`, "ok");
          setFix(undefined);
        } else {
          setStatus(response?.error ?? "no response", "err");
          setFix(response?.fix);
        }
      },
    );
  });

  toggleBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage(
      { kind: "froede-toggle-tab" } satisfies FroedeRuntimeMessage,
      (response: { ok: boolean; enabled?: boolean; error?: string } | undefined) => {
        if (response?.ok) {
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
})();
