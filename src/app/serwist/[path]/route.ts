import { createSerwistRoute } from "@serwist/turbopack";

const revision = crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: "/offline.html", revision }],
    swSrc: "src/sw.ts",
    useNativeEsbuild: true,
  });
