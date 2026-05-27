/**
 * Block Engine — evaluates declarative block rules against tier results.
 *
 * Loads rules from src/rules/block-rules.json and returns the subset
 * whose tiers produced a BLOCK-severity result.
 *
 * @module block-engine
 */

import { readFileSync } from "node:fs";
import { Severity } from "./result.mjs";

const RULES_PATH = new URL("../rules/block-rules.json", import.meta.url);
let _rules = null;

function loadRules() {
  if (!_rules) {
    const data = JSON.parse(readFileSync(RULES_PATH, "utf-8"));
    _rules = data.rules;
  }
  return _rules;
}

/**
 * @typedef {Object} TriggeredRule
 * @property {string} id
 * @property {string} name
 * @property {string} trigger
 * @property {string} severity
 * @property {string} remediation
 * @property {boolean} autoRepair
 * @property {string[]} matchedTiers
 */

/**
 * Evaluate block rules against a set of tier results.
 *
 * @param {import("./result.mjs").TierResult[]} tierResults
 * @returns {TriggeredRule[]}
 */
export function evaluateBlockRules(tierResults) {
  const rules = loadRules();
  const triggered = [];

  for (const rule of rules) {
    const matchingResults = tierResults.filter(
      (r) =>
        rule.tiers.includes(r.tierId) &&
        r.severity === Severity.BLOCK &&
        (!rule.evidenceChecks || r.evidence.some((e) => rule.evidenceChecks.includes(e.check))),
    );
    if (matchingResults.length > 0) {
      triggered.push({
        id: rule.id,
        name: rule.name,
        trigger: rule.trigger,
        severity: rule.severity,
        remediation: rule.remediation,
        autoRepair: rule.autoRepair,
        matchedTiers: matchingResults.map((r) => r.tierId),
      });
    }
  }

  return triggered;
}

/** Reset the cached rules (for testing only). */
export function _resetRulesCache() {
  _rules = null;
}
