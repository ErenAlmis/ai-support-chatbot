/*
 * Embeddable AI support chat widget.
 * Usage (one line on any website):
 *   <script src="https://YOUR-SERVER/widget.js"
 *           data-title="Harbor Dental Studio"
 *           data-color="#0f766e"
 *           data-welcome="Hi! How can I help you today?"></script>
 * Optional: data-api="https://YOUR-SERVER" (defaults to the script's own origin).
 * Renders inside a Shadow DOM so the host site's CSS can't break it (and vice versa).
 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script || window.__aiSupportWidget) return;
  window.__aiSupportWidget = true;

  var cfg = {
    api: (script.dataset.api || new URL(script.src).origin).replace(/\/$/, ""),
    title: script.dataset.title || "Support",
    color: script.dataset.color || "#0f766e",
    welcome: script.dataset.welcome || "Hi! How can I help you today?",
  };
  var STORE_KEY = "ai-support-history:" + location.host;

  function load() {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; }
  }
  function save(h) {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(h.slice(-20))); } catch (e) { /* ignore */ }
  }

  var history = load();
  var busy = false;

  var host = document.createElement("div");
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483000;";
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  root.innerHTML =
    "<style>" +
    ":host{--c:" + cfg.color + ";all:initial;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
    "*{box-sizing:border-box}" +
    ".fab{width:58px;height:58px;border-radius:50%;border:0;background:var(--c);color:#fff;cursor:pointer;" +
    "box-shadow:0 8px 24px rgba(0,0,0,.22);display:flex;align-items:center;justify-content:center;transition:transform .15s}" +
    ".fab:hover{transform:scale(1.06)}.fab svg{width:26px;height:26px}" +
    ".panel{position:absolute;right:0;bottom:72px;width:360px;max-width:calc(100vw - 32px);height:520px;" +
    "max-height:calc(100vh - 110px);background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.25);" +
    "display:none;flex-direction:column;overflow:hidden;color:#111}" +
    ".panel.open{display:flex}" +
    ".head{background:var(--c);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}" +
    ".dot{width:9px;height:9px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 3px rgba(255,255,255,.25)}" +
    ".head b{font-size:15px;flex:1}.head small{display:block;font-weight:400;opacity:.85;font-size:12px}" +
    ".x{background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:4px}" +
    ".log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f7f7f8}" +
    ".m{max-width:82%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
    ".m.a{background:#fff;border:1px solid #e5e7eb;align-self:flex-start;border-bottom-left-radius:4px}" +
    ".m.u{background:var(--c);color:#fff;align-self:flex-end;border-bottom-right-radius:4px}" +
    ".m.err{background:#fef2f2;border-color:#fecaca;color:#991b1b}" +
    ".typing{display:inline-flex;gap:4px}.typing i{width:6px;height:6px;border-radius:50%;background:#9ca3af;animation:b 1s infinite}" +
    ".typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}" +
    "@keyframes b{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}" +
    "form{display:flex;gap:8px;padding:12px;border-top:1px solid #e5e7eb;background:#fff}" +
    "input{flex:1;border:1px solid #d1d5db;border-radius:10px;padding:10px 12px;font-size:14px;outline:none;font-family:inherit;color:#111;background:#fff}" +
    "input:focus{border-color:var(--c)}" +
    "button.send{background:var(--c);color:#fff;border:0;border-radius:10px;padding:0 16px;font-size:14px;cursor:pointer;font-weight:600}" +
    "button.send:disabled{opacity:.5;cursor:default}" +
    ".foot{text-align:center;font-size:11px;color:#9ca3af;padding:0 0 8px;background:#fff}" +
    "</style>" +
    '<div class="panel" role="dialog" aria-label="Chat">' +
    '<div class="head"><span class="dot"></span><b></b><button class="x" aria-label="Close">&times;</button></div>' +
    '<div class="log" aria-live="polite"></div>' +
    '<form><input type="text" placeholder="Type your message..." maxlength="2000" aria-label="Message">' +
    '<button class="send" type="submit">Send</button></form>' +
    '<div class="foot">AI assistant &middot; may make mistakes</div></div>' +
    '<button class="fab" aria-label="Open chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>';

  var panel = root.querySelector(".panel");
  var log = root.querySelector(".log");
  var form = root.querySelector("form");
  var input = root.querySelector("input");
  var sendBtn = root.querySelector(".send");
  root.querySelector(".head b").textContent = cfg.title;

  function bubble(cls, text) {
    var el = document.createElement("div");
    el.className = "m " + cls;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function render() {
    log.innerHTML = "";
    bubble("a", cfg.welcome);
    history.forEach(function (m) { bubble(m.role === "user" ? "u" : "a", m.content); });
  }

  function toggle(open) {
    panel.classList.toggle("open", open);
    if (open) { input.focus(); log.scrollTop = log.scrollHeight; }
  }
  root.querySelector(".fab").addEventListener("click", function () { toggle(!panel.classList.contains("open")); });
  root.querySelector(".x").addEventListener("click", function () { toggle(false); });

  async function send(text) {
    busy = true;
    sendBtn.disabled = true;
    history.push({ role: "user", content: text });
    save(history);
    bubble("u", text);
    var out = bubble("a", "");
    out.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    var reply = "";

    try {
      var res = await fetch(cfg.api + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok) {
        var detail = "Something went wrong, please try again.";
        try { detail = (await res.json()).detail || detail; } catch (e) { /* ignore */ }
        throw new Error(typeof detail === "string" ? detail : "Invalid request.");
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buf = "";
      for (;;) {
        var r = await reader.read();
        if (r.done) break;
        buf += decoder.decode(r.value, { stream: true });
        var parts = buf.split("\n\n");
        buf = parts.pop();
        for (var i = 0; i < parts.length; i++) {
          var line = parts[i].trim();
          if (line.indexOf("data:") !== 0) continue;
          var evt = JSON.parse(line.slice(5));
          if (evt.type === "text") {
            reply += evt.text;
            out.textContent = reply;
            log.scrollTop = log.scrollHeight;
          } else if (evt.type === "error") {
            throw new Error(evt.message);
          }
        }
      }
      reply = reply.trim();
      if (!reply) throw new Error("No reply received, please try again.");
      out.textContent = reply;
      history.push({ role: "assistant", content: reply });
    } catch (err) {
      out.classList.add("err");
      out.textContent = err.message || "Connection error.";
      history.pop(); // drop the unanswered user turn so the next try stays valid
    }
    save(history);
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    input.value = "";
    send(text);
  });

  render();
})();
