#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selfTest as auditSelfTest } from "./audit-images.mjs";

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function listFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(fullPath));
    if (entry.isFile()) output.push(fullPath);
  }
  return output;
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function checkMarkdownLinks(markdownFiles) {
  const missing = [];
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;

  for (const file of markdownFiles) {
    const content = await readFile(file, "utf8");
    for (const match of content.matchAll(linkPattern)) {
      const href = match[1].trim().replace(/^<|>$/g, "").split("#")[0];
      if (!href || /^(?:https?:|mailto:|#)/i.test(href)) continue;
      const target = path.resolve(path.dirname(file), decodeURIComponent(href));
      if (!await exists(target)) {
        missing.push({
          source: path.relative(skillDir, file).split(path.sep).join("/"),
          href,
        });
      }
    }
  }

  return missing;
}

async function main() {
  const files = await listFiles(skillDir);
  const markdownFiles = files.filter((file) => file.endsWith(".md"));
  const textFiles = files.filter((file) => /\.(?:md|json|ya?ml|mjs)$/i.test(file));

  const missingLinks = await checkMarkdownLinks(markdownFiles);
  assert.deepEqual(missingLinks, [], `Missing local Markdown links: ${JSON.stringify(missingLinks)}`);

  const briefPath = path.join(skillDir, "assets", "site-brief.template.json");
  JSON.parse(await readFile(briefPath, "utf8"));

  const evaluationPath = path.join(skillDir, "assets", "evaluation-cases.json");
  const evaluation = JSON.parse(await readFile(evaluationPath, "utf8"));
  const positiveCases = evaluation.cases.filter((item) => item.shouldTrigger === true);
  const negativeCases = evaluation.cases.filter((item) => item.shouldTrigger === false);
  assert(positiveCases.length >= 6, "Evaluation set needs at least six positive trigger cases");
  assert(negativeCases.length >= 4, "Evaluation set needs at least four negative trigger cases");

  const openaiYaml = await readFile(path.join(skillDir, "agents", "openai.yaml"), "utf8");
  assert(openaiYaml.includes("$build-visual-first-site"), "Default prompt must name the skill explicitly");
  assert(/allow_implicit_invocation:\s*true/.test(openaiYaml), "Implicit invocation must remain enabled");

  const portablePathPattern = /\b[A-Za-z]:[\\/](?:Users|projects?|repos?|A1)\b/i;
  const priorBrand = String.fromCharCode(65, 69, 82, 65);
  const portabilityResidue = [];

  for (const file of textFiles) {
    const content = await readFile(file, "utf8");
    if (portablePathPattern.test(content) || content.includes(priorBrand)) {
      portabilityResidue.push(path.relative(skillDir, file).split(path.sep).join("/"));
    }
  }

  assert.deepEqual(
    portabilityResidue,
    [],
    `Project-specific residue found: ${JSON.stringify(portabilityResidue)}`,
  );

  const auditResult = auditSelfTest();
  assert.equal(auditResult.passed, true);

  console.log(JSON.stringify({
    passed: true,
    checks: {
      markdownLinks: markdownFiles.length,
      briefJson: "valid",
      evaluationCases: `${positiveCases.length} positive / ${negativeCases.length} negative`,
      openaiMetadata: "valid",
      portability: "no hard-coded local path or prior brand",
      imageAudit: auditResult.checks,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
