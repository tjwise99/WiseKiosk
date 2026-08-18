declare module 'virtual:config-validator' {
  import type { ErrorObject } from 'ajv';

  /**
   * The validation function compiled from `src/config/schema.json` at build time. It returns
   * whether the value conforms, and hangs every failure off its own `errors` property.
   */
  interface CompiledValidator {
    (value: unknown): boolean;
    errors?: ErrorObject[] | null;
  }

  const validate: CompiledValidator;
  export default validate;
}
