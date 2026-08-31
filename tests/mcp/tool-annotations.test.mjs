/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Tool annotations.
 *
 * An annotation is worth exactly as much as its accuracy: a client uses `readOnlyHint` to decide
 * whether to skip an approval prompt, so one that is convenient and wrong is worse than none at
 * all. These tests exist to pin the claims, especially the awkward ones -- the executors are NOT
 * read-only, and saying so costs a prompt on the most-used tool in the server.
 *
 * @author DoubleGate
 * @license GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import { annotationsForOperation, annotationsForMetaTool } from "../../src/node/lib/tool-annotations.mjs";
import OperationConfig from "../../src/core/config/OperationConfig.json" with {type: "json"};

describe("annotations for CyberChef operations", () => {
    it("describes an ordinary pure operation as safe to run unattended", () => {
        expect(annotationsForOperation("To Base64")).toEqual({
            title: "To Base64",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
        });
    });

    it("uses the CyberChef name as the title, not the sanitised tool name", () => {
        // `cyberchef_aes_encrypt` reads poorly in a tool picker; "AES Encrypt" is what every piece
        // of CyberChef documentation calls it.
        expect(annotationsForOperation("AES Encrypt").title).toBe("AES Encrypt");
    });

    it("marks HTTP request as neither read-only nor closed-world", () => {
        // It takes a method, so it can POST, PUT or DELETE against a caller-supplied URL.
        const a = annotationsForOperation("HTTP request");
        expect(a.readOnlyHint).toBe(false);
        expect(a.destructiveHint).toBe(true);
        expect(a.openWorldHint).toBe(true);
        expect(a.idempotentHint).toBe(false);
    });

    it("separates 'networked' from 'writes', which are independent properties", () => {
        // DNS over HTTPS reaches the network and changes nothing. Collapsing the two would either
        // over-warn on lookups or under-warn on requests.
        const a = annotationsForOperation("DNS over HTTPS");
        expect(a.openWorldHint).toBe(true);
        expect(a.readOnlyHint).toBe(true);
        expect(a.idempotentHint).toBe(false);
    });

    it("marks the operations that were measured to differ between two identical calls", () => {
        for (const op of [
            "Generate UUID",
            "Pseudo-Random Number Generator",
            "Bcrypt",
            "Derive PBKDF2 key",
            "Generate RSA Key Pair",
            "CipherSaber2 Encrypt"
        ]) {
            expect(annotationsForOperation(op).idempotentHint, op).toBe(false);
        }
    });

    it("does NOT mark operations whose defaults are fixed", () => {
        // Argon2 and Scrypt look like they belong on the list above and do not: run twice with
        // default arguments they produce identical output, because their salts are defaults rather
        // than freshly generated. Over-marking would cost real cacheability.
        for (const op of ["Argon2", "Scrypt", "MD5", "SHA2"]) {
            expect(annotationsForOperation(op).idempotentHint, op).toBe(true);
        }
    });

    it("treats the overwhelming majority of operations as pure", () => {
        // The property that makes annotating this server worthwhile at all. If this ratio ever
        // collapses, the assumption behind the whole module needs revisiting.
        const names = Object.keys(OperationConfig);
        const readOnly = names.filter(n => annotationsForOperation(n).readOnlyHint).length;
        const closedWorld = names.filter(n => !annotationsForOperation(n).openWorldHint).length;

        expect(readOnly).toBe(names.length - 1);          // only HTTP request writes
        expect(closedWorld).toBe(names.length - 2);       // only the two networked operations
    });

    it("returns a complete annotation set for every operation", () => {
        for (const name of Object.keys(OperationConfig)) {
            const a = annotationsForOperation(name);
            expect(typeof a.title, name).toBe("string");
            for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) {
                expect(typeof a[hint], `${name}.${hint}`).toBe("boolean");
            }
        }
    });
});

describe("annotations for this server's own tools", () => {
    it("does not claim an arbitrary-recipe executor is read-only", () => {
        // The awkward one, and the point of the module. `cyberchef_bake` can run `HTTP request`
        // with a method of POST, so calling it read-only is false -- however much a true would
        // save in approval prompts on the most-used tool here.
        for (const t of ["cyberchef_bake", "cyberchef_recipe_execute", "cyberchef_batch"]) {
            const a = annotationsForMetaTool(t, "x");
            expect(a.readOnlyHint, t).toBe(false);
            expect(a.openWorldHint, t).toBe(true);
            expect(a.idempotentHint, t).toBe(false);
            // Destructive too: a recipe may carry `HTTP request` with a DELETE, and
            // `destructiveHint` asks what the tool MAY do, not what it usually does. Over-warning
            // costs a prompt; under-warning costs a deletion nobody approved.
            expect(a.destructiveHint, t).toBe(true);
        }
    });

    it("marks recipe reads as read-only and recipe writes as not", () => {
        expect(annotationsForMetaTool("cyberchef_recipe_list", "x").readOnlyHint).toBe(true);
        expect(annotationsForMetaTool("cyberchef_recipe_get", "x").readOnlyHint).toBe(true);
        expect(annotationsForMetaTool("cyberchef_recipe_create", "x").readOnlyHint).toBe(false);
        expect(annotationsForMetaTool("cyberchef_recipe_update", "x").readOnlyHint).toBe(false);
    });

    it("marks only the recipe operations that can lose a caller's work as destructive", () => {
        expect(annotationsForMetaTool("cyberchef_recipe_delete", "x").destructiveHint).toBe(true);
        expect(annotationsForMetaTool("cyberchef_recipe_update", "x").destructiveHint).toBe(true);
        // Clears this server's own in-memory cache; nobody can lose work to it.
        expect(annotationsForMetaTool("cyberchef_cache_clear", "x").destructiveHint).toBe(false);
        expect(annotationsForMetaTool("cyberchef_recipe_create", "x").destructiveHint).toBe(false);
    });

    it("does not call a store write open-world just because it is non-idempotent", () => {
        // create and import mint an id on every call, which is why they are non-idempotent. That
        // says nothing about reaching the network, and conflating the two would mislead.
        for (const t of ["cyberchef_recipe_create", "cyberchef_recipe_import"]) {
            expect(annotationsForMetaTool(t, "x").idempotentHint, t).toBe(false);
            expect(annotationsForMetaTool(t, "x").openWorldHint, t).toBe(false);
        }
    });

    it("passes the title through", () => {
        expect(annotationsForMetaTool("cyberchef_recipe_create", "Recipe create").title)
            .toBe("Recipe create");
    });
});
