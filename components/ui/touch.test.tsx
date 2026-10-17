// @vitest-environment jsdom
// Toques en el teléfono (bug de iOS en 0.14.1): un toque no se trata como
// hover, los botones son <button type="button"> con onClick directo y el CSS
// evita el zoom por doble toque y al enfocar campos.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { Highlight, HighlightBackground, useHighlightItem } from "./highlight";
import { Tooltip } from "./tooltip";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Item({ value }: { value: string }) {
  const { highlighted, handlers } = useHighlightItem(value);
  return (
    <a href={`#${value}`} data-testid={value} data-on={highlighted} {...handlers}>
      <HighlightBackground show={highlighted} />
      {value}
    </a>
  );
}

function Nav() {
  return (
    <Highlight value="a" hover exitDelay={0}>
      <Item value="a" />
      <Item value="b" />
    </Highlight>
  );
}

describe("Highlight con toques", () => {
  it("un toque no mueve el fondo (iOS no pide un segundo toque)", () => {
    render(<Nav />);
    fireEvent.pointerOver(screen.getByTestId("b"), { pointerType: "touch" });
    expect(screen.getByTestId("a").dataset.on).toBe("true");
    expect(screen.getByTestId("b").dataset.on).toBe("false");
  });

  it("el mouse sí lo mueve", () => {
    render(<Nav />);
    fireEvent.pointerOver(screen.getByTestId("b"), { pointerType: "mouse" });
    expect(screen.getByTestId("b").dataset.on).toBe("true");
  });

  it("el foco de un toque no lo mueve (solo el del teclado)", () => {
    render(<Nav />);
    fireEvent.focus(screen.getByTestId("b"));
    expect(screen.getByTestId("b").dataset.on).toBe("false");
  });
});

describe("Tooltip con toques", () => {
  it("un toque no lo abre por hover; el mouse sí", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="detalle">
        <span tabIndex={0}>monto</span>
      </Tooltip>,
    );
    const trigger = screen.getByText("monto").parentElement!;
    fireEvent.pointerOver(trigger, { pointerType: "touch" });
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.pointerOver(trigger, { pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByRole("tooltip").textContent).toBe("detalle");
  });
});

describe("Button", () => {
  it('es <button type="button"> y el clic llega directo a onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Continuar con Google</Button>);
    const button = screen.getByRole("button", { name: "Continuar con Google" });
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("CSS para iOS", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  it("botones, enlaces y chips con touch-action: manipulation", () => {
    const block = css.slice(
      css.indexOf("@layer base {\n  a,"),
      css.indexOf("touch-action: manipulation"),
    );
    for (const selector of ["a,", "button,", '[role="button"]', '[role="radio"]']) {
      expect(block).toContain(selector);
    }
  });

  it("los campos usan 16 px en el teléfono (Safari no hace zoom al enfocar)", () => {
    expect(css).toMatch(
      /@media \(max-width: 599px\) \{\s*input,\s*select,\s*textarea \{\s*font-size: 16px;/,
    );
  });
});
