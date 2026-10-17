#!/usr/bin/env node
/**
 * Seed de demostración. Se niega siempre: el proyecto enlazado guarda los
 * datos reales de desarrollo y de producción. No ejecuta SQL.
 */
import { readLinkedProjectRef, seedRefusal } from "./db-guard.mjs";

console.error(seedRefusal(readLinkedProjectRef()));
process.exit(1);
