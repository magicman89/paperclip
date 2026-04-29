import { describe, expect, it } from "vitest";
import type { AdapterExecutionResult } from "../adapters/types.js";
import {
  buildConcreteHeartbeatResultJson,
  buildHeartbeatCloseoutComment,
} from "../services/heartbeat-result-closeout.js";

const baseResult: AdapterExecutionResult = {
  exitCode: 0,
  signal: null,
  timedOut: false,
};

describe("heartbeat result closeout", () => {
  it("adds durable run, agent, issue, runtime, and concrete closeout fields", () => {
    const result = buildConcreteHeartbeatResultJson({
      agentName: "Builder Bot",
      runId: "run-123",
      status: "succeeded",
      adapterResult: {
        ...baseResult,
        provider: "openai",
        model: "gpt-5.5",
        resultJson: { result: "patched files" },
      },
      issue: {
        id: "issue-1",
        identifier: "BUL-320",
        title: "Execution bridge",
      },
      stdoutExcerpt: "stdout proof",
      stderrExcerpt: "",
      runtimePrimaryUrl: "https://runtime.example.test",
    });

    expect(result).toMatchObject({
      summary: "patched files",
      result: "patched files",
      status: "succeeded",
      runId: "run-123",
      agentName: "Builder Bot",
      issueId: "issue-1",
      issueIdentifier: "BUL-320",
      issueTitle: "Execution bridge",
      runtimePrimaryUrl: "https://runtime.example.test",
      provider: "openai",
      model: "gpt-5.5",
      stdoutExcerpt: "stdout proof",
      concreteCloseout: true,
    });
  });

  it("falls back to a useful summary when adapters return empty result_json", () => {
    const result = buildConcreteHeartbeatResultJson({
      agentName: "Quiet Bot",
      runId: "run-456",
      status: "succeeded",
      adapterResult: baseResult,
      issue: {
        id: "issue-2",
        identifier: "BUL-321",
        title: "No empty heartbeats",
      },
    });

    expect(result.summary).toBe("Quiet Bot completed a Paperclip heartbeat run for BUL-321.");
    expect(result).toMatchObject({
      status: "succeeded",
      runId: "run-456",
      agentName: "Quiet Bot",
      issueIdentifier: "BUL-321",
      concreteCloseout: true,
    });
  });

  it("builds a Paperclip source-of-truth closeout comment", () => {
    const resultJson = buildConcreteHeartbeatResultJson({
      agentName: "Closer Bot",
      runId: "run-789",
      status: "failed",
      adapterResult: {
        ...baseResult,
        exitCode: 1,
        errorMessage: "adapter failed",
      },
      issue: null,
      stderrExcerpt: "failure logs",
    });

    const comment = buildHeartbeatCloseoutComment({
      agentName: "Closer Bot",
      runId: "run-789",
      status: "failed",
      adapterResult: {
        ...baseResult,
        exitCode: 1,
        errorMessage: "adapter failed",
      },
      issue: null,
      resultJson,
    });

    expect(comment).toContain("Paperclip execution closeout: failed");
    expect(comment).toContain("- Agent: Closer Bot");
    expect(comment).toContain("- Run: run-789");
    expect(comment).toContain("- Error: adapter failed");
    expect(comment).toContain("Source of truth: Paperclip issue comments and Obsidian handoff notes; Telegram is command-room chatter only.");
  });
});
