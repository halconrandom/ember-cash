/**
 * Web App Manifest. Los hex son el token --canvas de app/globals.css
 * (#f5f5f7): el manifest no acepta variables CSS. Los PNG están en
 * public/icons/ y salen de docs/design/logos/svg/icon-orange-tile.svg
 * sin editar ese archivo.
 */
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ember Cash",
    short_name: "Ember Cash",
    description: "Finanzas personales",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#f5f5f7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
