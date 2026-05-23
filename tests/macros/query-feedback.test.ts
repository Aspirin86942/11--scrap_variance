import { describe, expect, it, vi } from "vitest";
import {
  isUserNotifiedError,
  markUserNotifiedError,
  showUserMessage
} from "../../src/macros/query-feedback";
import type { ScrapVarianceGlobal } from "../../src/types/wps";

describe("query feedback helpers", () => {
  it("marks object errors as already notified", () => {
    const error = new Error("write failed");

    expect(markUserNotifiedError(error)).toBe(error);
    expect(isUserNotifiedError(error)).toBe(true);
    expect(isUserNotifiedError(new Error("other"))).toBe(false);
    expect(isUserNotifiedError("plain error")).toBe(false);
  });

  it("falls back to console.error when alert is unavailable", () => {
    const consoleError = vi.fn();
    const root = {
      alert: "not callable",
      console: { error: consoleError, log: vi.fn() }
    } as unknown as ScrapVarianceGlobal;

    showUserMessage(root, "query finished");

    expect(consoleError).toHaveBeenCalledWith("query finished");
  });

  it("does not throw when alert and console.error are unavailable", () => {
    const root = {
      console: { error: "not callable" }
    } as unknown as ScrapVarianceGlobal;

    expect(() => showUserMessage(root, "query finished")).not.toThrow();
  });
});
