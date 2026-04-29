import type { AdapterExecutionResult } from "../adapters/types.js";

type IssueRef = {
  id: string;
  identifier: string | null;
  title: string;
} | null;

type CloseoutInput = {
  agentName: string;
  runId: string;
  status: "succeeded" | "failed" | "cancelled" | "timed_out";
  adapterResult: AdapterExecutionResult;
  issue: IssueRef;
  stdoutExcerpt?: string | null;
  stderrExcerpt?: string | null;
  runtimePrimaryUrl?: string | null;
};

const MAX_FIELD_LENGTH = 1_500;
const MAX_COMMENT_FIELD_LENGTH = 700;

function readNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = readNonEmptyString(value);
    if (text) return truncate(text, MAX_FIELD_LENGTH);
  }
  return null;
}

function compactExcerpt(value: string | null | undefined) {
  const text = readNonEmptyString(value);
  return text ? truncate(text, MAX_FIELD_LENGTH) : null;
}

export function buildConcreteHeartbeatResultJson(input: CloseoutInput): Record<string, unknown> {
  const existing = normalizeRecord(input.adapterResult.resultJson) ?? {};
  const existingSummary = firstText(
    existing.summary,
    existing.result,
    existing.message,
    input.adapterResult.summary,
  );
  const fallbackSummary =
    input.status === "succeeded"
      ? `${input.agentName} completed a Paperclip heartbeat run${input.issue?.identifier ? ` for ${input.issue.identifier}` : ""}.`
      : `${input.agentName} finished a Paperclip heartbeat run with status ${input.status}.`;
  const stdout = compactExcerpt(input.stdoutExcerpt);
  const stderr = compactExcerpt(input.stderrExcerpt);

  return {
    ...existing,
    summary: existingSummary ?? fallbackSummary,
    status: input.status,
    runId: input.runId,
    agentName: input.agentName,
    ...(input.issue
      ? {
          issueId: input.issue.id,
          issueIdentifier: input.issue.identifier,
          issueTitle: input.issue.title,
        }
      : {}),
    ...(input.runtimePrimaryUrl ? { runtimePrimaryUrl: input.runtimePrimaryUrl } : {}),
    ...(input.adapterResult.provider ? { provider: input.adapterResult.provider } : {}),
    ...(input.adapterResult.model ? { model: input.adapterResult.model } : {}),
    ...(input.adapterResult.errorMessage ? { error: input.adapterResult.errorMessage } : {}),
    ...(stdout ? { stdoutExcerpt: stdout } : {}),
    ...(stderr ? { stderrExcerpt: stderr } : {}),
    concreteCloseout: true,
  };
}

function commentLine(label: string, value: unknown) {
  const text = readNonEmptyString(value);
  return text ? `- ${label}: ${truncate(text, MAX_COMMENT_FIELD_LENGTH)}` : null;
}

export function buildHeartbeatCloseoutComment(input: CloseoutInput & { resultJson: Record<string, unknown> }) {
  const result = input.resultJson;
  const lines = [
    `Paperclip execution closeout: ${input.status}`,
    "",
    commentLine("Agent", input.agentName),
    commentLine("Run", input.runId),
    commentLine("Summary", result.summary),
    commentLine("Result", result.result),
    commentLine("Message", result.message),
    commentLine("Runtime", input.runtimePrimaryUrl ?? result.runtimePrimaryUrl),
    commentLine("Error", result.error ?? input.adapterResult.errorMessage),
  ].filter((line): line is string => line !== null);

  return `${lines.join("\n")}\n\nSource of truth: Paperclip issue comments and Obsidian handoff notes; Telegram is command-room chatter only.`;
}
