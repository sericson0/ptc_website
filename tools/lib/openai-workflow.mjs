import { openAsBlob } from "node:fs";

const API_ROOT = "https://api.openai.com/v1";

async function openaiRequest(url, options, apiKey) {
  const response = await fetch(API_ROOT + url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.message || JSON.stringify(body) || response.statusText;
    throw new Error(`OpenAI request failed (${response.status}): ${detail}`);
  }
  return body;
}

export async function transcribeChunk(filePath, apiKey, model = "whisper-1") {
  const form = new FormData();
  form.append("file", await openAsBlob(filePath, { type: "audio/mpeg" }), "lesson-audio.mp3");
  form.append("model", model);
  form.append("language", "en");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("prompt", "Argentine tango dance lesson. Preserve dance terminology and step names accurately.");
  return openaiRequest("/audio/transcriptions", { method: "POST", body: form }, apiKey);
}

const lessonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lessonTitle", "notes", "sections", "practice", "youtubeTitle", "youtubeDescription", "youtubeTags"],
  properties: {
    lessonTitle: { type: "string" },
    notes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    sections: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "points"],
        properties: {
          title: { type: "string" },
          points: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "timeSeconds"],
              properties: {
                text: { type: "string" },
                timeSeconds: { type: "number", minimum: 0 },
              },
            },
          },
        },
      },
    },
    practice: { type: "array", items: { type: "string" }, maxItems: 6 },
    youtubeTitle: { type: "string", maxLength: 100 },
    youtubeDescription: { type: "string", maxLength: 5000 },
    youtubeTags: { type: "array", items: { type: "string" }, maxItems: 15 },
  },
};

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("The content response did not contain output text.");
}

export async function createLessonDraft({ transcript, context, apiKey, model = "gpt-5-mini" }) {
  const instructions = [
    "Turn an Argentine tango teaching-video transcript into accurate lesson-library copy.",
    "Use only claims supported by the transcript. Keep the instructor's meaning; fix speech disfluencies.",
    "Organize key teaching points into useful named sections. Each point needs a representative timestamp from the supplied timeline for extracting a still image.",
    "Prefer moments where the movement being described is likely visible. Do not invent homework; derive practice prompts from the demonstrated material.",
    "Write a concise YouTube title and description. The description should summarize the lesson and include a short key-points list, but must not claim links that were not supplied.",
  ].join(" ");
  const input = [
    `Site placement and instructor context:\n${context || "No extra context supplied."}`,
    `Timestamped transcript:\n${transcript}`,
  ].join("\n\n");
  const response = await openaiRequest("/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      instructions,
      input,
      text: {
        format: {
          type: "json_schema",
          name: "ptc_lesson_draft",
          strict: true,
          schema: lessonSchema,
        },
      },
    }),
  }, apiKey);
  return JSON.parse(outputText(response));
}
