// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import projects from "./src/data/generated-projects.json" with { type: "json" };
import { pagesBase, pagesSite, pagesBaseIntegration } from "./scripts/pages-base.mjs";

// https://astro.build/config
export default defineConfig({
  site: pagesSite,
  base: pagesBase || '/',
  vite: { server: { watch: { ignored: ["**/.tools/**"] } } },
  integrations: [
    starlight({
      title: "ZZOO 动动物园 · 文档",
      customCss: ["./src/styles/starlight-docs.css"],
      disable404Route: true,
      locales: {
        root: { label: "简体中文", lang: "zh-CN" },
      },
      head: [
        {
          tag: "meta",
          attrs: { name: "robots", content: "noindex, nofollow" },
        },
      ],
      sidebar: [
        { label: "全部项目文档", slug: "docs" },
        ...projects.map((project) => ({
          label: project.title,
          collapsed: true,
          items: [
            {
              label: `${project.title} 文档目录`,
              link: `/docs/${project.id}/`,
            },
            ...project.docs.map((doc) => ({
              label: doc.title,
              link: doc.href,
            })),
          ],
        })),
      ],
    }),
    pagesBaseIntegration(pagesBase),
  ],
});
