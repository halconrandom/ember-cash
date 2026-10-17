// @vitest-environment jsdom
// prefers-reduced-motion: nada se desplaza. La opacidad puede fundirse
// (spec §7). Los modales se abren y se cierran.
import { readFileSync } from "node:fs";

import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { MotionConfig, motion } from "motion/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Modal } from "@/components/ui/modal";
import { ProgressRing } from "@/components/ui/progress-ring";
import { renderWithIntl } from "@/test/intl";

vi.mock("next/navigation", () => ({
  usePathname: () => "/savings",
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

function transformOf(element: Element): string {
  return (element as HTMLElement).style.transform;
}

async function nextFrames(count = 3) {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
  }
}

describe("movimiento reducido", () => {
  it("un desplazamiento y una escala quedan en el valor final; la opacidad funde", async () => {
    renderWithIntl(
      <MotionConfig reducedMotion="always">
        <motion.div
          data-testid="box"
          initial={{ x: 0, scale: 0.96, opacity: 0 }}
          animate={{ x: 40, scale: 1, opacity: 1 }}
          transition={{ duration: 2 }}
        />
      </MotionConfig>,
    );
    await nextFrames(2);
    const box = screen.getByTestId("box");
    // x ya está en 40 y la escala 1 no aparece (es la identidad). Nada se mueve.
    expect(transformOf(box)).toBe("translateX(40px)");
    const opacity = Number(box.style.opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });

  it("sin reducir, el desplazamiento sigue en camino", async () => {
    renderWithIntl(
      <MotionConfig reducedMotion="never">
        <motion.div
          data-testid="moving"
          initial={{ x: 0 }}
          animate={{ x: 40 }}
          transition={{ duration: 2 }}
        />
      </MotionConfig>,
    );
    await nextFrames(2);
    expect(transformOf(screen.getByTestId("moving"))).not.toBe("translateX(40px)");
  });

  it("el anillo muestra el arco final, sin dibujarlo", async () => {
    const { container } = renderWithIntl(
      <MotionConfig reducedMotion="always">
        <ProgressRing percent={50} label="half" />
      </MotionConfig>,
    );
    await nextFrames();
    const arc = container.querySelectorAll("circle")[1] as SVGCircleElement;
    const length = Number(arc.getAttribute("stroke-dasharray"));
    const offset = Number(arc.style.strokeDashoffset || arc.getAttribute("stroke-dashoffset"));
    expect(length).toBeGreaterThan(0);
    expect(offset).toBeCloseTo(length / 2, 0);
  });

  it("la presión en CSS no escala", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toContain(".press-scale:active");
    expect(block).toMatch(/\.press-scale:active\s*\{[^}]*transform:\s*none/);
  });
});

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open modal
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Pay the bill" closeLabel="Close">
        <p>Amount due</p>
      </Modal>
    </>
  );
}

describe("modal", () => {
  it("se abre, sale en 220 ms y también cierra con Escape", async () => {
    renderWithIntl(
      <MotionConfig reducedMotion="never">
        <ModalHarness />
      </MotionConfig>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open modal" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Amount due")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    // Sigue montado mientras sale.
    expect(screen.getByText("Amount due")).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(screen.queryByText("Amount due")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open modal" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByText("Amount due")).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(screen.queryByText("Amount due")).toBeNull();
  });
});
