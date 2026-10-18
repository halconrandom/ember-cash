// @vitest-environment jsdom
// Sin consentimiento no se pinta la app.
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithIntl as render } from "@/test/intl";

import { ConsentBoundary } from "./consent-boundary";

afterEach(cleanup);

describe("ConsentBoundary", () => {
  it("no muestra la app si falta el consentimiento", () => {
    render(
      <ConsentBoundary allowed={false} blocked={<p>Bloqueada</p>}>
        <p>App</p>
      </ConsentBoundary>,
    );
    expect(screen.getByText("Bloqueada").textContent).toBe("Bloqueada");
    expect(screen.queryByText("App")).toBeNull();
  });

  it("muestra la app cuando el consentimiento está vigente", () => {
    render(
      <ConsentBoundary allowed={true} blocked={<p>Bloqueada</p>}>
        <p>App</p>
      </ConsentBoundary>,
    );
    expect(screen.getByText("App").textContent).toBe("App");
    expect(screen.queryByText("Bloqueada")).toBeNull();
  });
});
