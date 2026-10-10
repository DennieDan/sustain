// Mocha ships no type declarations; this covers only the programmatic runner API the
// e2e harness uses. The TDD interface functions are typed in tdd.ts. See ADR 0016.

declare module "mocha" {
  interface MochaOptions {
    ui?: "tdd" | "bdd";
    color?: boolean;
    timeout?: number;
  }
  interface Runner {
    on(event: "end", listener: () => void): this;
  }
  class Mocha {
    constructor(options?: MochaOptions);
    addFile(file: string): this;
    run(callback: (failures: number) => void): Runner;
  }
  export default Mocha;
}
