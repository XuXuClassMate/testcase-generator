/**
 * AI Adapter — drives any ModelEntry using the right SDK.
 *
 * Vendor routing:
 *   anthropic  → @anthropic-ai/sdk
 *   openai     → openai (official SDK, native)
 *   deepseek   → openai SDK + DeepSeek base URL
 *   minimax    → openai SDK + MiniMax base URL
 *   qwen       → openai SDK + DashScope compatible URL
 *   gemini     → openai SDK + Gemini OpenAI-compat URL
 *   moonshot   → openai SDK + Moonshot URL
 *   zhipu      → openai SDK + Zhipu URL
 *   custom     → openai SDK + user-supplied baseUrl
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { ModelEntry, AIVendor } from "./types";

export interface AIMessage {
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

// Default base URLs per vendor
const VENDOR_BASE_URLS: Partial<Record<AIVendor, string>> = {
  deepseek: "https://api.deepseek.com/v1",
  minimax:  "https://api.minimax.chat/v1",
  qwen:     "https://dashscope.aliyuncs.com/compatible-mode/v1",
  gemini:   "https://generativelanguage.googleapis.com/v1beta/openai",
  moonshot: "https://api.moonshot.cn/v1",
  zhipu:    "https://open.bigmodel.cn/api/paas/v4",
};

// Default model names per vendor (used if ModelEntry.model is empty)
const VENDOR_DEFAULT_MODELS: Partial<Record<AIVendor, string>> = {
  anthropic: "claude-opus-4-5",
  openai:    "gpt-4o",
  deepseek:  "deepseek-chat",
  minimax:   "MiniMax-Text-01",
  qwen:      "qwen-max",
  gemini:    "gemini-2.0-flash",
  moonshot:  "moonshot-v1-8k",
  zhipu:     "glm-4",
};

export class AIAdapter {
  private entry: ModelEntry;

  constructor(entry: ModelEntry) {
    this.entry = entry;
  }

  get modelId(): string { return this.entry.id; }
  get vendor(): AIVendor { return this.entry.vendor; }

  async complete(systemPrompt: string, messages: AIMessage[]): Promise<string> {
    if (!this.entry.apiKey) {
      throw new Error(`API key not set for model "${this.entry.id}" (${this.entry.vendor})`);
    }
    switch (this.entry.vendor) {
      case "anthropic":
        return this.callAnthropic(systemPrompt, messages);
      default:
        return this.callOpenAICompat(systemPrompt, messages);
    }
  }

  // ── Anthropic (native SDK) ──────────────────────────────────────────────────

  private async callAnthropic(systemPrompt: string, messages: AIMessage[]): Promise<string> {
    const client = new Anthropic({
      apiKey: this.entry.apiKey,
      baseURL: this.entry.baseUrl,
    });

    const converted: Anthropic.MessageParam[] = messages.map((m) => {
      if (typeof m.content === "string") return { role: m.role, content: m.content };
      const parts: Anthropic.ContentBlockParam[] = m.content.map((part) => {
        if (part.type === "text") return { type: "text", text: part.text };
        const url = (part as { type: "image_url"; image_url: { url: string } }).image_url.url;
        const [meta, data] = url.split(",");
        const mediaType = meta.replace("data:", "").replace(";base64", "") as
          "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        return { type: "image", source: { type: "base64", media_type: mediaType, data } } as Anthropic.ImageBlockParam;
      });
      return { role: m.role, content: parts };
    });

    const modelName = this.entry.model || VENDOR_DEFAULT_MODELS.anthropic!;
    const extraParams = (this.entry.params ?? {}) as Record<string, unknown>;

    const resp = await client.messages.create({
      model: modelName,
      max_tokens: (extraParams.max_tokens as number) ?? 8192,
      system: systemPrompt,
      messages: converted,
      temperature: (extraParams.temperature as number) ?? undefined,
    } as Anthropic.MessageCreateParamsNonStreaming);

    return resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  // ── OpenAI-compatible (all other vendors) ──────────────────────────────────

  private async callOpenAICompat(systemPrompt: string, messages: AIMessage[]): Promise<string> {
    const baseURL = this.entry.baseUrl ?? VENDOR_BASE_URLS[this.entry.vendor];
    const client = new OpenAI({ apiKey: this.entry.apiKey, baseURL });

    const modelName = this.entry.model || VENDOR_DEFAULT_MODELS[this.entry.vendor] || "gpt-4o";
    const extraParams = (this.entry.params ?? {}) as Record<string, unknown>;

    // Convert our message format to OpenAI format
    const oaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m): OpenAI.ChatCompletionMessageParam => {
        if (typeof m.content === "string") {
          return m.role === "user"
            ? { role: "user", content: m.content }
            : { role: "assistant", content: m.content };
        }
        // Multimodal — only supported if vendor supports it
        const parts: OpenAI.ChatCompletionContentPart[] = m.content.map((p) => {
          if (p.type === "text") return { type: "text", text: p.text };
          return {
            type: "image_url",
            image_url: { url: (p as { type: "image_url"; image_url: { url: string } }).image_url.url },
          };
        });

        if (m.role === "user") {
          return { role: "user", content: parts };
        }

        return {
          role: "assistant",
          content: m.content
            .filter((part): part is { type: "text"; text: string } => part.type === "text")
            .map((part) => part.text)
            .join("\n"),
        };
      }),
    ];

    const resp = await client.chat.completions.create({
      model: modelName,
      max_tokens: (extraParams.max_tokens as number) ?? 8192,
      temperature: (extraParams.temperature as number) ?? undefined,
      messages: oaiMessages,
    });

    return resp.choices[0]?.message?.content ?? "";
  }
}
