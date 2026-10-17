// La licencia gratuita de Uicons pide el texto "designed by {autor} from Flaticon" con enlace.
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import es from "@/messages/es.json";

describe("atribución de Flaticon", () => {
  it("Acerca de nombra a Flaticon como autor y como sitio, en los dos idiomas", () => {
    expect(es.settings.attribution).toBe(
      "Íconos Uicons diseñados por <author>Flaticon</author> de <site>Flaticon</site>.",
    );
    expect(en.settings.attribution).toBe(
      "Uicons designed by <author>Flaticon</author> from <site>Flaticon</site>.",
    );
  });
});
