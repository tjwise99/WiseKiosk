/**
 * What the page shell hands a module as its payload, and what a module's route hands the shell.
 *
 * Shared framework code: it names no module and knows nothing of what any payload carries, the data
 * being the module's own type (docs/contracts/module-contract.md § Dependency direction).
 */

/**
 * One answer from a module's route: the status it answered at, and the body carried at it. The
 * status is what tells a reading from a failure, the boundary schema carrying a different body at
 * each (ADR 0008 rev 4), so nothing here parses a body to find out which it is.
 */
export interface ModuleAnswer {
  readonly status: number;
  readonly data: unknown;
}

/**
 * A module's payload as it reaches the component: not yet read, read, or read and failed. A module
 * renders every one of the three — there is no fourth state and no absent payload, so a component
 * cannot be handed nothing and leave its region blank.
 */
export type Payload<Data> =
  | { readonly state: 'loading' }
  | { readonly state: 'ok'; readonly data: Data }
  | { readonly state: 'unavailable'; readonly failure: PayloadFailure };

/**
 * Why a module has no reading. Both bodies the boundary carries at a failing status spell the reason
 * for a reader the same way, so this is the part of either that a module renders (SRS001).
 */
export interface PayloadFailure {
  readonly message: string;
}
