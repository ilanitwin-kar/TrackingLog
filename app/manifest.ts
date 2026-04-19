import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "יומן אינטליגנציה קלורית",
    short_name: "קלוריות",
    description: "יומן קלוריות חכם עם יעדים, משקל ודוח אסטרטגי",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#fffafd",
    theme_color: "#9b1b30",
    orientation: "portrait-primary",
    categories: ["health", "lifestyle", "food"],
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
