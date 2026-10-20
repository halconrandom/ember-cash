// Lista cerrada de eventos: nombre y props, sin claves de más.
import { describe, expect, it } from "vitest";

import { validateEvent } from "./validate";

describe("eventos", () => {
  it("acepta los seis nombres con la forma de props que les toca", () => {
    expect(validateEvent("onboarding_started", {})?.props).toEqual({});
    expect(validateEvent("onboarding_completed", undefined)?.props).toEqual({});
    expect(validateEvent("onboarding_step_completed", { step: 2 })?.props).toEqual({ step: 2 });
    expect(validateEvent("onboarding_skipped", { step: 0 })?.props).toEqual({ step: 0 });
    expect(validateEvent("first_item_created", { type: "account" })?.props).toEqual({
      type: "account",
    });
    expect(validateEvent("help_opened", { page: "dashboard" })?.props).toEqual({
      page: "dashboard",
    });
  });

  it("rechaza nombres, pasos y props que no están en la lista", () => {
    expect(validateEvent("page_view", {})).toBeNull();
    expect(validateEvent("onboarding_started", { step: 0 })).toBeNull();
    expect(validateEvent("onboarding_step_completed", { step: 5 })).toBeNull();
    expect(validateEvent("onboarding_step_completed", { step: "1" })).toBeNull();
    expect(validateEvent("onboarding_skipped", { step: 1, extra: true })).toBeNull();
    expect(validateEvent("first_item_created", { type: "sample" })).toBeNull();
    expect(validateEvent("help_opened", { page: "admin" })).toBeNull();
    expect(validateEvent("help_opened", [])).toBeNull();
  });
});
