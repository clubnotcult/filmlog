import type { MetadataRoute } from "next";

/**
 * Next.js generates /manifest.webmanifest from this at build time.
 *
 * `sizes: "any"` is used deliberately rather than a guessed pixel size
 * (e.g. "512x512") — some browsers use the declared size to pick the best
 * icon for a given context and will skip one whose declared size doesn't
 * match its actual dimensions. "any" tells every browser this one icon is
 * fine to use regardless of the size it needs, which is the safe choice
 * without knowing filmlogicon.png's real dimensions.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Film Log",
    short_name: "Film Log",
    description: "A private companion for logging 35mm film photography.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0c",
    theme_color: "#0b0b0c",
    icons: [
      {
        src: "/filmlogicon.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
