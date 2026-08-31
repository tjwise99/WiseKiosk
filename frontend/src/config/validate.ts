import validate from 'virtual:config-validator';

import type { WiseKioskDisplayConfiguration } from './types';

/** One thing wrong with a configuration, in the terms an operator edits it in. */
export interface ConfigurationFault {
  /** A JSON Pointer to the offending value; the empty string names the document itself. */
  readonly where: string;
  readonly what: string;
}

export type ValidationResult =
  | { readonly valid: true; readonly configuration: WiseKioskDisplayConfiguration }
  | { readonly valid: false; readonly faults: readonly ConfigurationFault[] };

/**
 * Runs the one validator the schema's rules are enforced by
 * ([ADR 0007 rev 2](../../../docs/decisions/0007-config-validation-allocation.md)) over a parsed
 * configuration, reporting every fault rather than the first. The validator writes the schema's
 * defaults into `value` in place as it runs, so a caller keeps the returned `configuration` and
 * lets the argument go; the fill lands on the rejection path too, where the mutated value is
 * discarded with the rest.
 */
export function validateConfiguration(value: unknown): ValidationResult {
  if (validate(value)) {
    return { valid: true, configuration: value as WiseKioskDisplayConfiguration };
  }

  const faults = (validate.errors ?? []).map(
    (error): ConfigurationFault => ({
      where: error.instancePath,
      what: describe(error),
    }),
  );

  // A validator that rejects a value and reports nothing would otherwise render an empty report,
  // which reads as a page that decided nothing rather than one that rejected the configuration.
  return {
    valid: false,
    faults: faults.length > 0 ? faults : [{ where: '', what: 'is not a valid configuration' }],
  };
}

/** The validator's own message, widened with the parameters an operator needs to act on it. */
function describe(error: { keyword: string; message?: string; params: Record<string, unknown> }) {
  const message = error.message ?? 'is not valid';
  if (error.keyword === 'additionalProperties') {
    return `${message}: ${String(error.params.additionalProperty)}`;
  }
  if (error.keyword === 'enum' && Array.isArray(error.params.allowedValues)) {
    return `${message}: ${error.params.allowedValues.join(', ')}`;
  }
  if (error.keyword === 'required') {
    return `${message}: ${String(error.params.missingProperty)}`;
  }
  return message;
}
