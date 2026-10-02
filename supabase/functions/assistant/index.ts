// Edge Function "assistant": recibe lo que dices, consulta a un modelo de Groq y devuelve
// una lista de cambios PROPUESTOS (la página te pide confirmación antes de aplicarlos).
// La clave de Groq vive solo aquí, como secreto (GROQ_API_KEY).
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

// Modelos de Groq que soportan salida JSON estricta, en orden de preferencia.
// Puedes forzar uno con el secreto GROQ_MODEL.
const DEFAULT_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

// Modo estricto: todas las propiedades son obligatorias (los vacíos van como null).
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "changes"],
  properties: {
    reply: { type: "string" },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "taskId", "course", "title", "type", "date", "time"],
        properties: {
          action: { type: "string", enum: ["add", "update", "complete", "delete"] },
          taskId: { type: ["string", "null"] },
          course: { type: ["string", "null"], enum: [...Object.keys(COURSES), null] },
          title: { type: ["string", "null"] },
          type: { type: ["string", "null"], enum: ["deliverable", "reading", null] },
          date: { type: ["string", "null"] },
          time: { type: ["string", "null"] },
        },
      },
    },
  },
};

function systemPrompt(ctx: any) {
  return `Eres el asistente de un checklist académico de una estudiante de maestría (MISM) en BYU.
Ella te dice (por voz o texto, en español, a veces mezclando inglés) lo que tiene que hacer o cambios que hicieron los profesores en Canvas.
Tu trabajo: convertir eso en cambios PROPUESTOS sobre su lista de tareas. Nada se aplica hasta que ella confirme.

Fecha y hora actuales: ${ctx.today} (${ctx.weekday}) ${ctx.time}, zona horaria ${ctx.timezone}.
La semana empieza el lunes. "El jueves" = el próximo jueves (si hoy es jueves, hoy). "Mañana", "el viernes", "la próxima semana" se resuelven con la fecha de hoy.

Clases (usa SIEMPRE uno de estos ids en "course"):
${Object.entries(COURSES).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

Formato de salida: un objeto con "reply" y "changes". En cada cambio incluye siempre todos los campos; los que no apliquen van como null.
- "add": tarea nueva. Necesita course, title, type ("deliverable" = entrega/quiz/proyecto; "reading" = lectura/preparación) y date (YYYY-MM-DD). time (HH:MM, 24h) solo si ella lo dice; si no, null. taskId = null.
- "update": cambia una tarea existente (fecha, título, etc.). Usa el taskId EXACTO de la lista. Pon solo los campos que cambian; el resto null.
- "complete": marcar como hecha una tarea existente (taskId exacto).
- "delete": solo si ella pide quitarla explícitamente (taskId exacto).

Reglas:
- Antes de proponer "add", busca en la lista si ya existe una tarea equivalente (mismo tema/título parecido en la misma clase). Si existe, propón "update" en vez de duplicar.
- Mantén los títulos cortos y en el idioma en que ella los dijo (suelen estar en inglés, como en Canvas).
- Si falta un dato imprescindible (por ejemplo, de qué clase es o qué día), NO inventes: devuelve "changes" vacío y pregunta en "reply".
- Si ella corrige algo de tu propuesta anterior, devuelve la lista COMPLETA y corregida de cambios (no solo la diferencia).
- "reply": 1 o 2 frases cortas en español, naturales. Habla SIEMPRE en términos de propuesta ("Te propongo agregar…", "¿Los aplico?"), nunca digas que ya agregaste o cambiaste algo: nada se aplica hasta que ella confirme. No repitas toda la lista de cambios en el texto.

Tareas pendientes relevantes (cada una: [id, clase, título, vence]):
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

    const key = Deno.env.get("GROQ_API_KEY");
    if (!key) return json({ error: "Falta configurar GROQ_API_KEY en Supabase (Edge Functions > Secrets)." }, 500);
    const forced = Deno.env.get("GROQ_MODEL");
    const models = forced ? [forced] : DEFAULT_MODELS;

    // 2) Validar la entrada.
    const body = await req.json();
    const message = String(body?.message ?? "").slice(0, 2000);
    if (!message.trim()) return json({ error: "Mensaje vacío." }, 400);
    const history = (Array.isArray(body?.history) ? body.history : []).slice(-6).map((h: any) => ({
      role: h?.role === "model" || h?.role === "assistant" ? "assistant" : "user",
      content: String(h?.text ?? "").slice(0, 1500),
    }));
    const ctx = body?.context ?? {};
    ctx.tasks = (Array.isArray(ctx.tasks) ? ctx.tasks : []).slice(0, 200).map((t: any) => [
      String(t.id), String(t.course), String(t.title).slice(0, 80), t.due ?? null,
    ]);

    // 3) Llamar a Groq con salida estructurada (probando el siguiente modelo si falla).
    const messages = [
      { role: "system", content: systemPrompt(ctx) },
      ...history,
      { role: "user", content: message },
    ];
    let res: Response | null = null;
    let model = models[0];
    let lastDetail = "";
    for (const m of models) {
      model = m;
      const payload: Record<string, unknown> = {
        model: m,
        messages,
        temperature: 0.2,
        max_completion_tokens: 1500,
        response_format: { type: "json_schema", json_schema: { name: "task_changes", strict: true, schema: SCHEMA } },
      };
      if (m.startsWith("openai/gpt-oss")) payload.reasoning_effort = "low";
      res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) break;
      lastDetail = await res.text();
      console.error("Groq error", res.status, m, lastDetail);
      if (![400, 404, 413, 429, 500, 503].includes(res.status)) break;
    }
    if (!res || !res.ok) {
      const status = res?.status ?? 500;
      let why = "";
      try { why = String(JSON.parse(lastDetail)?.error?.message ?? "").slice(0, 280); } catch (_) { /* sin detalle */ }
      const base =
        status === 429 ? "Se alcanzó el límite gratuito de Groq por ahora. Espera un minuto e inténtalo de nuevo."
        : status === 401 || status === 403 ? "Groq rechazó la clave. Revisa el secreto GROQ_API_KEY en Supabase."
        : status === 413 ? "La lista de tareas es demasiado grande para esta consulta. Intenta de nuevo con un mensaje más específico."
        : `Groq respondió con error ${status} (modelo ${model}).`;
      return json({ error: why ? `${base}\n\nDetalle de Groq: ${why}` : base }, 502);
    }

    const out = await res.json();
    const raw = out?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { /* respuesta no JSON */ }

    const changes = (Array.isArray(parsed.changes) ? parsed.changes : []).slice(0, 40);
    return json({ reply: String(parsed.reply ?? ""), changes });
  } catch (e) {
    console.error(e);
    return json({ error: "Error interno del asistente." }, 500);
  }
});
