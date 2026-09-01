// SPDX-License-Identifier: GPL-3.0-or-later
//
// Astro's Content Layer requires the `docs` collection to be declared explicitly. Without it the
// build SUCCEEDS and produces a site with one page -- a 404 -- which is a considerably worse
// failure than an error, because it looks like it worked.
import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

export const collections = {
    docs: defineCollection({ loader: docsLoader(), schema: docsSchema() })
};
