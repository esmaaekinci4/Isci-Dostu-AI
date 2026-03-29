/**
 * İşçi Dostu AI
 * — Görev 2: Ana panel (meslek + günlük ipucu)
 * — Görev 3: Google AI Studio (Gemini) API katmanı
 */
(function () {
  "use strict";

  document.documentElement.classList.add("js-ready");

  // --- Sabitler ---
  const LS_API_KEY = "iscidostu_gemini_api_key";
  /** Kararlı REST: v1 — https://ai.google.dev/gemini-api/docs/api-versions */
  const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
  /** Uygulama genelinde sabit model (değiştirmek için bu satırı düzenleyin) */
  const GEMINI_MODEL_FIXED = "gemini-1.5-flash";

  const CONTRACT_SYSTEM =
    "Sen 4857 sayılı İş Kanunu ve 6331 sayılı İSG Kanunu konusunda uzman, babacan ve sakin bir mentorsun. Kullanıcı sana bir metin verdiğinde, bunu bir işçinin anlayabileceği en sade dille, madde madde ve emojiler kullanarak açıkla.";

  const CHAT_SYSTEM = [
    "Sen 'Hak Asistanı'sın.",
    "4857 sayılı İş Kanunu ve 6331 sayılı İş Sağlığı ve Güvenliği Kanunu çerçevesinde çalışanlara yanıt veriyorsun.",
    "Teknik terimleri kısaca açıkla; samimi ve anlaşılır Türkçe kullan.",
    "Yanıtlar bilgilendiricidir; kesin hukuki danışmanlık yerine geçmez. Dava veya ciddi uyuşmazlık durumunda avukat veya sendika/İK yönlendirmesi öner.",
    "Gerekirse kanun maddelerine genel atıf yap; abartılı kesinlikten kaçın.",
  ].join("\n");

  /** @type {Record<string, string>} */
  const PROFESSION_LABELS = {
    insaat: "İnşaat",
    saglik: "Sağlık",
    fabrika: "Üretim",
    ofis: "Ofis",
    perakende: "Perakende",
    ulasim: "Lojistik",
    tarim: "Tarım",
    genel: "Genel",
  };

  /** @type {Record<string, string[]>} */
  const TIPS_BY_PROFESSION = {
    insaat: [
      "Bugün baretini, ayakkabını ve varsa emniyet kemerini kontrol ettin mi?",
      "İskele ve merdivenlere çıkmadan önce sabitlemelerin sağlam olduğundan emin ol.",
      "Gürültülü ortamda işitme koruyucu kullanmayı unutma.",
      "Elektrikli alet kullanırken topraklama ve kabloların durumuna bak.",
    ],
    saglik: [
      "El hijyeni ve doğru eldiven kullanımı bugün de seni ve hastaları korur.",
      "Bedensel olarak zor anlarda kısa ergonomik molalar ver.",
      "Kesici-delici atıkları her zaman işaretli kaplara ayır.",
      "Duygusal yük hissediyorsan meslektaşın veya destek hattı ile konuşmayı erteleme.",
    ],
    fabrika: [
      "Makine koruyucularını kaldırmadan önce mutlaka enerjiyi kes ve kilitle.",
      "Bugün kullanacağın kişisel koruyucu donanımı (KKD) eksiksiz mi kontrol et.",
      "Kimyasallarla çalışıyorsan etiketi oku ve havalandırmayı gözden geçir.",
      "Ağır kaldırırken dizlerini kullan, sırtını düz tut.",
    ],
    ofis: [
      "Ekran göz hizanda mı? 20-20-20 kuralını hatırla: her 20 dakikada 20 saniye uzağa bak.",
      "Sandalye ve masa yüksekliğini bugün bir kez daha ayarla.",
      "Uzun toplantılarda kısa ayağa kalkma molaları planla.",
      "Klavye ve fare için bileklerini düz tut; gereksiz gerilme birikmesin.",
    ],
    perakende: [
      "Kaygan zemin uyarılarına dikkat et; ıslak yerlerde yavaş ve güvenli adım at.",
      "Raflardan yük alırken ağır paketleri dizlerinden kaldır.",
      "Vardiya sonunda kasa ve tezgâh ergonomisini gözden geçir.",
      "Stresli müşteri anlarında kendine nefes molası ver.",
    ],
    ulasim: [
      "Araç öncesi yürüyüş ve gerilme ile vücudunu ısıt; uzun sürüşlerde molayı atlama.",
      "Yük bağlama ve indirmede vücut mekaniğine dikkat et.",
      "Hava ve yol koşullarına göre hızını ayarla; yorgunken direksiyona geçme.",
      "Depo ve rampalarda görünürlük için reflektör veya uygun giysiyi kullan.",
    ],
    tarim: [
      "Güneş ve sıcaklığa karşı şapka, su ve gölge molalarını unutma.",
      "Pestisit veya kimyasal kullanıyorsan talimatlara ve KKD’ye uy.",
      "Traktör ve ekipmanlarda güvenlik kilidi ve çocukların uzak durması kuralına uy.",
      "Kesici aletleri kullanmadan önce bıçakların keskin ve sapların sağlam olduğunu kontrol et.",
    ],
    genel: [
      "İşe başlamadan önce bugünkü riskleri kısaca düşün: neye dikkat etmen gerekiyor?",
      "Acil çıkışlar ve ilk yardım malzemelerinin yerini biliyor musun, hatırla.",
      "Mobbing veya hak ihlali hissediyorsan kayıt tutmayı ve güvenilir bir mercie başvurmayı düşün.",
      "Ergonomik mola vermeyi unutma: kısa ara vermek verimi ve sağlığı artırır.",
    ],
  };

  // --- Gemini: anahtar / model çözümleme ---
  function resolveGeminiApiKey() {
    const fromWindow =
      typeof window !== "undefined" && window.GEMINI_API_KEY
        ? String(window.GEMINI_API_KEY).trim()
        : "";
    if (fromWindow) return fromWindow;
    try {
      const s = localStorage.getItem(LS_API_KEY);
      return s ? s.trim() : "";
    } catch {
      return "";
    }
  }

  function resolveGeminiModel() {
    return GEMINI_MODEL_FIXED;
  }

  function redactKeyInUrl(url) {
    return String(url || "").replace(/([?&])key=[^&]*/g, "$1key=(GİZLİ)");
  }

  /**
   * @param {Response} res
   * @param {Record<string, unknown>} data
   * @param {string} requestUrl
   */
  function formatGeminiErrorDetail(res, data, requestUrl) {
    const lines = [];
    lines.push("İstek adresi: " + redactKeyInUrl(requestUrl));
    lines.push("HTTP: " + res.status + " " + (res.statusText || "").trim());
    const err = data && data.error;
    if (err && typeof err === "object") {
      const o = /** @type {Record<string, unknown>} */ (err);
      if (o.status != null) lines.push("API error.status: " + String(o.status));
      if (o.code != null) lines.push("API error.code: " + String(o.code));
      if (typeof o.message === "string") lines.push("API error.message: " + o.message);
      if (o.details != null) {
        try {
          lines.push("API error.details: " + JSON.stringify(o.details).slice(0, 1200));
        } catch {
          lines.push("API error.details: (serileştirilemedi)");
        }
      }
    } else if (data && Object.keys(data).length > 0) {
      try {
        lines.push("Yanıt gövdesi: " + JSON.stringify(data).slice(0, 1200));
      } catch {
        lines.push("Yanıt gövdesi okunamadı.");
      }
    }
    return lines.join("\n");
  }

  function buildGeminiUserFacingError(res, data, requestUrl, apiMessage) {
    const hint = humanizeGeminiError(apiMessage);
    const detail = formatGeminiErrorDetail(res, data, requestUrl);
    return hint + "\n\n── Teknik detay ──\n" + detail;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /** API metnindeki "Please retry in 1.2s" ifadesinden bekleme süresi (ms) */
  function parseRetryDelayMs(apiMessage) {
    const m = /retry in ([\d.]+)\s*s/i.exec(String(apiMessage || ""));
    if (!m) return 0;
    const sec = parseFloat(m[1]);
    if (!Number.isFinite(sec) || sec < 0 || sec > 120) return 0;
    return Math.ceil((sec + 0.3) * 1000);
  }

  function humanizeGeminiError(raw) {
    const s = String(raw || "");
    if (/not found|NOT_FOUND|is not supported for generateContent|404/i.test(s)) {
      return (
        "Model veya uç nokta bulunamadı / desteklenmiyor. " +
        "Şu an kullanılan sabit model: «" +
        GEMINI_MODEL_FIXED +
        "», API: v1. " +
        "Google AI Studio’da API anahtarınızın bağlı olduğu projede bu modelin açık olduğunu doğrulayın; " +
        "gerekirse ListModels ile kullanılabilir modelleri kontrol edin: " +
        "https://ai.google.dev/api/rest/v1beta/models/list"
      );
    }
    if (
      /quota|exceeded your current quota|RESOURCE_EXHAUSTED|free_tier|generate_content_free_tier|rate[\s_-]?limit|\b429\b/i.test(
        s
      )
    ) {
      return (
        "Gemini kotası veya istek sınırı aşıldı. " +
        "Google AI Studio / Cloud’da kotayı ve faturalandırmayı kontrol edin. " +
        "Bilgi: https://ai.google.dev/gemini-api/docs/rate-limits"
      );
    }
    return s;
  }

  /**
   * @param {{ role: string, parts: { text: string }[] }[]} contents
   * @param {{ systemInstruction?: string, temperature?: number, maxOutputTokens?: number }} [opts]
   * @param {number} [attempt] dahili — bir kez kısa gecikmeyle yeniden dene
   * @returns {Promise<string>}
   */
  async function geminiRequest(contents, opts, attempt) {
    const tryIndex = typeof attempt === "number" ? attempt : 0;
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
      throw new Error("API anahtarı yok. config.js veya API panelinden ekleyin.");
    }
    const model = GEMINI_MODEL_FIXED;
    const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    /** @type {Record<string, unknown>} */
    const body = {
      contents,
      generationConfig: {
        temperature: opts && typeof opts.temperature === "number" ? opts.temperature : 0.4,
        maxOutputTokens:
          opts && typeof opts.maxOutputTokens === "number" ? opts.maxOutputTokens : 512,
      },
    };

    if (opts && opts.systemInstruction && opts.systemInstruction.trim()) {
      body.systemInstruction = {
        parts: [{ text: opts.systemInstruction.trim() }],
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = /** @type {Record<string, unknown>} */ (await res.json().catch(() => ({})));

    if (!res.ok) {
      const msg =
        (data && data.error && typeof data.error.message === "string" && data.error.message) ||
        res.statusText ||
        "İstek başarısız";
      if (tryIndex < 1) {
        const delay = parseRetryDelayMs(msg);
        if (delay > 0) {
          await sleep(delay);
          return geminiRequest(contents, opts, tryIndex + 1);
        }
      }
      throw new Error(buildGeminiUserFacingError(res, data, url, msg));
    }

    const candidate = data.candidates && data.candidates[0];
    const respParts = candidate && candidate.content && candidate.content.parts;
    const text =
      respParts &&
      respParts[0] &&
      typeof respParts[0].text === "string" &&
      respParts[0].text.trim();

    if (!text) {
      const reason = candidate && candidate.finishReason;
      let extra = "";
      try {
        extra = "\n\n── Teknik detay ──\n" + JSON.stringify(data).slice(0, 1500);
      } catch {
        extra = "";
      }
      throw new Error(
        (reason
          ? "Yanıt üretilemedi (finishReason: " + reason + ")."
          : "Yanıt metni boş veya güvenlik nedeniyle engellenmiş olabilir.") + extra
      );
    }

    return text.trim();
  }

  /**
   * Tek kullanıcı mesajı ile çağrı
   * @param {string} userText
   * @param {{ systemInstruction?: string, temperature?: number, maxOutputTokens?: number }} [opts]
   */
  async function geminiGenerateContent(userText, opts) {
    return geminiRequest([{ role: "user", parts: [{ text: userText }] }], opts);
  }

  /** Sohbet geçmişi (Gemini: user / model) */
  function trimChatTurns(turns, maxPairs) {
    const max = maxPairs * 2;
    if (turns.length <= max) return turns;
    return turns.slice(turns.length - max);
  }

  // --- UI: API durumu ---
  const apiPill = document.getElementById("api-status-pill");
  const apiStatusLabel = document.getElementById("api-status-label");

  function setApiPill(state, label) {
    if (apiPill) apiPill.setAttribute("data-state", state);
    if (apiStatusLabel) apiStatusLabel.textContent = label;
  }

  function refreshApiPill() {
    const has = !!resolveGeminiApiKey();
    if (!has) {
      setApiPill("unset", "API yapılandır");
      return;
    }
    const last = apiPill && apiPill.getAttribute("data-state");
    if (last === "ok" || last === "error") return;
    setApiPill("ready", "API tanımlı");
  }

  // --- Günlük ipucu ---
  function dayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    return Math.floor(diff / 86400000);
  }

  function pickDailyTip(professionKey) {
    const list = TIPS_BY_PROFESSION[professionKey];
    if (!list || !list.length) return "";
    const d = dayOfYear(new Date());
    const idx = d % list.length;
    return list[idx];
  }

  const select = document.getElementById("profession-select");
  const tipCard = document.getElementById("tip-card");
  const tipText = document.getElementById("daily-tip-text");
  const tipHint = document.getElementById("tip-hint");
  const statProfession = document.getElementById("stat-profession-label");

  function updateProfessionStat(key) {
    if (!statProfession) return;
    statProfession.textContent = key ? PROFESSION_LABELS[key] || "—" : "—";
  }

  function updateTip() {
    const key = select && select.value;
    updateProfessionStat(key || "");
    if (!key) {
      if (tipCard) tipCard.hidden = true;
      if (tipHint) tipHint.hidden = false;
      if (tipText) tipText.textContent = "";
      return;
    }
    const tip = pickDailyTip(key);
    if (tipText) tipText.textContent = tip;
    if (tipCard) tipCard.hidden = false;
    if (tipHint) tipHint.hidden = true;
  }

  if (select) {
    select.addEventListener("change", updateTip);
    updateTip();
  }

  // --- API paneli ---
  const apiKeyInput = document.getElementById("api-key-input");
  const apiModelInput = document.getElementById("api-model-input");
  const apiSaveBtn = document.getElementById("api-save-btn");
  const apiTestBtn = document.getElementById("api-test-btn");
  const apiClearBtn = document.getElementById("api-clear-btn");
  const apiTestResult = document.getElementById("api-test-result");

  function setTestResult(message, kind) {
    if (!apiTestResult) return;
    apiTestResult.textContent = message || "";
    apiTestResult.classList.remove("is-success", "is-error");
    if (kind === "success") apiTestResult.classList.add("is-success");
    if (kind === "error") apiTestResult.classList.add("is-error");
  }

  function initApiForm() {
    if (apiModelInput) {
      apiModelInput.value = GEMINI_MODEL_FIXED;
    }
    refreshApiPill();
  }

  if (apiSaveBtn) {
    apiSaveBtn.addEventListener("click", function () {
      const raw = apiKeyInput ? apiKeyInput.value.trim() : "";
      try {
        if (raw) localStorage.setItem(LS_API_KEY, raw);
      } catch (e) {
        setTestResult("Tarayıcı depolamasına yazılamadı.", "error");
        return;
      }
      if (apiKeyInput) apiKeyInput.value = "";
      const hasKey = !!resolveGeminiApiKey();
      if (raw) {
        setTestResult("API anahtarı kaydedildi. Bağlantıyı test edebilirsiniz.", "success");
      } else {
        setTestResult(
          hasKey
            ? "Anahtar alanı boştu; kayıtlı anahtar korundu."
            : "Anahtar yok. API anahtarı girin veya config.js içinde GEMINI_API_KEY tanımlayın.",
          hasKey ? "success" : "error"
        );
      }
      setApiPill(hasKey ? "ready" : "unset", hasKey ? "API tanımlı" : "API yapılandır");
    });
  }

  if (apiClearBtn) {
    apiClearBtn.addEventListener("click", function () {
      try {
        localStorage.removeItem(LS_API_KEY);
      } catch {
        /* ignore */
      }
      if (apiKeyInput) apiKeyInput.value = "";
      setTestResult("Tarayıcıda saklanan API anahtarı silindi.", "error");
      refreshApiPill();
    });
  }

  if (apiTestBtn) {
    apiTestBtn.addEventListener("click", async function () {
      setTestResult("Test ediliyor…", "");
      try {
        const reply = await geminiGenerateContent(
          'Tek kelimeyle yanıt ver: "tamam". Başka açıklama yazma.',
          { temperature: 0, maxOutputTokens: 32 }
        );
        setTestResult(`Bağlantı başarılı. Örnek yanıt: ${reply}`, "success");
        setApiPill("ok", "API bağlı");
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        setTestResult(`Bağlantı hatası: ${msg}`, "error");
        setApiPill("error", "API hatası");
      }
    });
  }

  initApiForm();

  // --- Sözleşme Analizcisi ---
  const contractText = document.getElementById("contract-text");
  const contractAnalyzeBtn = document.getElementById("contract-analyze-btn");
  const contractClearBtn = document.getElementById("contract-clear-btn");
  const contractStatus = document.getElementById("contract-status");
  const contractOutputWrap = document.getElementById("contract-output-wrap");
  const contractOutput = document.getElementById("contract-output");

  function setContractStatus(msg, kind) {
    if (!contractStatus) return;
    contractStatus.textContent = msg || "";
    contractStatus.classList.remove("is-busy", "is-error");
    if (kind === "busy") contractStatus.classList.add("is-busy");
    if (kind === "error") contractStatus.classList.add("is-error");
  }

  if (contractClearBtn && contractText) {
    contractClearBtn.addEventListener("click", function () {
      contractText.value = "";
      if (contractOutput) contractOutput.textContent = "";
      if (contractOutputWrap) contractOutputWrap.hidden = true;
      setContractStatus("");
    });
  }

  if (contractAnalyzeBtn) {
    contractAnalyzeBtn.addEventListener("click", async function () {
      const raw = contractText ? contractText.value.trim() : "";
      if (!resolveGeminiApiKey()) {
        setContractStatus("Önce Gemini API anahtarını tanımlayın.", "error");
        return;
      }
      if (raw.length < 80) {
        setContractStatus("Lütfen analiz için yeterince uzun bir sözleşme metni yapıştırın (en az ~80 karakter).", "error");
        return;
      }
      const userPayload =
        "Aşağıdaki metin bir iş sözleşmesi veya taslağıdır. Sistem talimatlarına göre analiz et.\n\n---\n" +
        raw +
        "\n---";

      contractAnalyzeBtn.disabled = true;
      if (contractClearBtn) contractClearBtn.disabled = true;
      setContractStatus("Metin Gemini ile analiz ediliyor…", "busy");
      if (contractOutput) contractOutput.textContent = "";
      if (contractOutputWrap) contractOutputWrap.hidden = true;

      try {
        const reply = await geminiRequest(
          [{ role: "user", parts: [{ text: userPayload }] }],
          {
            systemInstruction: CONTRACT_SYSTEM,
            temperature: 0.25,
            maxOutputTokens: 4096,
          }
        );
        if (contractOutput) contractOutput.textContent = reply;
        if (contractOutputWrap) contractOutputWrap.hidden = false;
        setContractStatus("Analiz tamamlandı.");
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        setContractStatus("Hata: " + msg, "error");
      } finally {
        contractAnalyzeBtn.disabled = false;
        if (contractClearBtn) contractClearBtn.disabled = false;
      }
    });
  }

  // --- Hukuk Chatbotu ---
  const chatMessagesEl = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const chatSendBtn = document.getElementById("chat-send-btn");
  const chatClearBtn = document.getElementById("chat-clear-btn");
  /** @type {{ role: 'user'|'model', text: string }[]} */
  let chatTurns = [];
  const CHAT_MAX_PAIRS = 10;

  function scrollChatToEnd() {
    if (!chatMessagesEl) return;
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  function appendChatBubble(role, text) {
    if (!chatMessagesEl) return;
    const wrap = document.createElement("div");
    wrap.className =
      role === "user" ? "chat-msg chat-msg--user" : "chat-msg chat-msg--bot";
    const p = document.createElement("p");
    p.textContent = text;
    wrap.appendChild(p);
    chatMessagesEl.appendChild(wrap);
    scrollChatToEnd();
  }

  function setTypingIndicator(show) {
    if (!chatMessagesEl) return;
    const id = "chat-typing-indicator";
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    if (!show) return;
    const wrap = document.createElement("div");
    wrap.id = id;
    wrap.className = "chat-msg chat-msg--bot chat-msg--typing";
    const p = document.createElement("p");
    p.textContent = "Yanıt hazırlanıyor…";
    wrap.appendChild(p);
    chatMessagesEl.appendChild(wrap);
    scrollChatToEnd();
  }

  function resetChatUi() {
    chatTurns = [];
    if (!chatMessagesEl) return;
    const intro = chatMessagesEl.querySelector(".chat-msg--intro");
    const introClone = intro ? intro.cloneNode(true) : null;
    chatMessagesEl.innerHTML = "";
    if (introClone) chatMessagesEl.appendChild(introClone);
    scrollChatToEnd();
  }

  async function sendChatMessage() {
    const text = chatInput ? chatInput.value.trim() : "";
    if (!text) return;
    if (!resolveGeminiApiKey()) {
      appendChatBubble(
        "model",
        "Gemini API anahtarı tanımlı değil. Üstteki API bölümünden veya config.js dosyasından anahtar ekleyin."
      );
      return;
    }

    if (chatInput) chatInput.value = "";
    appendChatBubble("user", text);
    chatTurns.push({ role: "user", text });

    const trimmed = trimChatTurns(chatTurns, CHAT_MAX_PAIRS);
    chatTurns = trimmed;
    const contents = trimmed.map(function (t) {
      return { role: t.role, parts: [{ text: t.text }] };
    });

    if (chatSendBtn) chatSendBtn.disabled = true;
    if (chatClearBtn) chatClearBtn.disabled = true;
    setTypingIndicator(true);

    try {
      const reply = await geminiRequest(contents, {
        systemInstruction: CHAT_SYSTEM,
        temperature: 0.45,
        maxOutputTokens: 2048,
      });
      setTypingIndicator(false);
      chatTurns.push({ role: "model", text: reply });
      appendChatBubble("model", reply);
    } catch (e) {
      setTypingIndicator(false);
      const msg = e && e.message ? e.message : String(e);
      const errReply =
        "Üzgünüm, yanıt alınamadı: " + msg + " Lütfen tekrar deneyin.";
      chatTurns.push({ role: "model", text: errReply });
      appendChatBubble("model", errReply);
    } finally {
      if (chatSendBtn) chatSendBtn.disabled = false;
      if (chatClearBtn) chatClearBtn.disabled = false;
    }
  }

  if (chatSendBtn) {
    chatSendBtn.addEventListener("click", function () {
      sendChatMessage();
    });
  }

  if (chatClearBtn) {
    chatClearBtn.addEventListener("click", function () {
      resetChatUi();
    });
  }

  if (chatInput) {
    chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  /** Sonraki görevlerde kullanılmak üzere */
  window.IsciDostuAI = {
    resolveGeminiApiKey,
    resolveGeminiModel,
    GEMINI_MODEL_FIXED,
    geminiGenerateContent,
    geminiRequest,
  };
})();
