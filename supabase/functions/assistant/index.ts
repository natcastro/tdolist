// Edge Function "assistant": recibe lo que dices, consulta a Gemini y devuelve
// una lista de cambios PROPUESTOS (la página te pide confirmación antes de aplicarlos).
// La clave de Gemini vive solo aquí, como secreto (GEMINI_API_KEY).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COURSES = {
  HRM540: "HRM 540 Organizational Effectiveness (comportamiento organizacional, equipos, casos, liderazgo)",
  IS531: "IS 531 Enterprise Infrastructure (infraestructura, hardware, sistemas operativos, labs)",
  IS550: "IS 550 MISM Capstone Introduction (proyecto capstone, pitch, lean canvas)",
  IS551: "IS 551 User Experience Design (UX, diseño, prototipos, Figma)",
  IS560: "IS 560 Information Security Management (seguridad, labs de pentesting, war room)",
  IS590R: "IS 590R AI and Agentic Systems (IA, RAG, agentes, memos de equipo)",
};

// Elige automáticamente el modelo Flash más nuevo disponible para tu clave
// (o usa GEMINI_MODEL si lo defines como secreto).
let cachedModel: string | null = null;
async function pickModel(key: string): Promise<string> {
  const forced = Deno.env.get("GEMINI_MODEL");
  if (forced) return forced;
  if (cachedModel) return cachedModel;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": key },
    });
    if (r.ok) {
      const { models = [] } = await r.json();
      const nums = (n: string) => (n.match(/(\d+(?:\.\d+)*)/)?.[1] ?? "0").split(".").map(Number);
      const newest = (a: string, b: string) => {
        const x = nums(a), y = nums(b);
        for (let i = 0; i < Math.max(x.length, y.length); i++) {
          const d = (y[i] ?? 0) - (x[i] ?? 0);
          if (d) return d;
        }
        return 0;
      };
      const usable = models
        .filter((m: any) => /flash/i.test(m.name) && (m.supportedGenerationMethods ?? []).includes("generateContent"))
        .map((m: any) => String(m.name).replace(/^models\//, ""))
        .filter((n: string) => !/(lite|image|live|tts|audio|embedding)/i.test(n));
      const stable = usable.filter((n: string) => !/(preview|exp|thinking|latest)/i.test(n));
      const pick = (stable.length ? stable : usable).sort(newest)[0];
      if (pick) { cachedModel = pick; return pick; }
    }
  } catch (_) { /* usa el valor por defecto */ }
  return "gemini-2.5-flash";
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    changes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          action: { type: "STRING", enum: ["add", "update", "complete", "delete"] },
          taskId: { type: "STRING", nullable: true },
          course: { type: "STRING", enum: Object.keys(COURSES), nullable: true },
          title: { type: "STRING", nullable: true },
          type: { type: "STRING", enum: ["deliverable", "reading"], nullable: true },
          date: { type: "STRING", nullable: true },
          time: { type: "STRING", nullable: true },
        },
        required: ["action"],
      },
    },
  },
  required: ["reply", "changes"],
};

function systemPrompt(ctx: any) {
  return `Eres el asistente de un checklist académico de una estudiante de maestría (MISM) en BYU.
Ella te dice (por voz o texto, en español, a veces mezclando inglés) lo que tiene que hacer o cambios que hicieron los profesores en Canvas.
Tu trabajo: convertir eso en cambios PROPUESTOS sobre su lista de tareas. Nada se aplica hasta que ella confirme.

Fecha y hora actuales: ${ctx.today} (${ctx.weekday}) ${ctx.time}, zona horaria ${ctx.timezone}.
La semana empieza el lunes. "El jueves" = el próximo jueves (si hoy es jueves, hoy). "Mañana", "el viernes", "la próxima semana" se resuelven con la fecha de hoy.

Clases (usa SIEMPRE uno de estos ids en "course"):
${Object.entries(COURSES).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

Reglas:
- "add": tarea nueva. Necesita course, title, type ("deliverable" = entrega/quiz/proyecto; "reading" = lectura/preparación) y date (YYYY-MM-DD). time (HH:MM, 24h) solo si ella lo dice; si no, null.
- "update": cambia una tarea existente (fecha, título, etc.). Usa el taskId EXACTO de la lista. Envía solo los campos que cambian; el resto null.
- "complete": marcar como hecha una tarea existente (taskId exacto).
- "delete": solo si ella pide quitarla explícitamente (taskId exacto).
- Antes de proponer "add", busca en la lista si ya existe una tarea equivalente (mismo tema/título parecido en la misma clase). Si existe, propón "update" en vez de duplicar.
- Mantén los títulos cortos y en el idioma en que ella los dijo (suelen estar en inglés, como en Canvas).
- Si falta un dato imprescindible (por ejemplo, de qué clase es o qué día), NO inventes: devuelve "changes" vacío y pregunta en "reply".
- Si ella corrige algo de tu propuesta anterior, devuelve la lista COMPLETA y corregida de cambios (no solo la diferencia).
- "reply": 1 o 2 frases cortas en español, naturales, resumiendo lo que entendiste o preguntando lo que falta. No repitas toda la lista de cambios en el texto.

Tareas pendientes actuales (JSON, id|clase|título|vence|tipo):
${JSON.stringify(ctx.tasks)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // 1) Solo usuarios con sesión iniciada (la clave anon por sí sola NO basta).
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const apikey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const who = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey },
    });
    const user = who.ok ? await who.json() : null;
    if (!user?.id) return json({ error: "Sesión no válida. Recarga la página e inicia sesión." }, 401);

    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ error: "Falta configurar GEMINI_API_KEY en Supabase (Edge Functions > Secrets)." }, 500);
    const model = await pickModel(key);

    // 2) Validar la entrada.
    const body = await req.json();
    const message = String(body?.message ?? "").slice(0, 2000);
    if (!message.trim()) return json({ error: "Mensaje vacío." }, 400);
    const history = (Array.isArray(body?.history) ? body.history : []).slice(-8).map((h: any) => ({
      role: h?.role === "model" ? "model" : "user",
      parts: [{ text: String(h?.text ?? "").slice(0, 2000) }],
    }));
    const ctx = body?.context ?? {};
    ctx.tasks = (Array.isArray(ctx.tasks) ? ctx.tasks : []).slice(0, 500).map((t: any) => [
      String(t.id), String(t.course), String(t.title).slice(0, 120), t.due ?? null, t.type,
    ]);

    // 3) Llamar a Gemini con salida estructurada.
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(ctx) }] },
        contents: [...history, { role: "user", parts: [{ text: message }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2 },
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("Gemini error", res.status, model, detail);
      if (res.status === 404) cachedModel = null;
      const msg =
        res.status === 429 ? "Se alcanzó el límite gratuito de Gemini por ahora. Espera un minuto e inténtalo de nuevo."
        : res.status === 401 || res.status === 403 ? "Gemini rechazó la clave. Revisa el secreto GEMINI_API_KEY en Supabase."
        : res.status === 404 ? `Gemini no encontró el modelo "${model}". Define el secreto GEMINI_MODEL con un modelo de tu lista en AI Studio.`
        : `Gemini respondió con error ${res.status} (modelo ${model}).`;
      return json({ error: msg }, 502);
    }
    const out = await res.json();
    const raw = out?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { /* respuesta no JSON */ }

    const changes = (Array.isArray(parsed.changes) ? parsed.changes : []).slice(0, 40);
    return json({ reply: String(parsed.reply ?? ""), changes });
  } catch (e) {
    console.error(e);
    return json({ error: "Error interno del asistente." }, 500);
  }
});
