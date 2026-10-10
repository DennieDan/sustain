// Mocha's TDD interface installs suite/test/... as globals just before it requires each
// test file, so reading them here (evaluated during that require) is safe. Importing them
// from this module keeps them out of the global type scope shared with the vitest suites.

type Body = () => void | Promise<unknown>;

interface TddInterface {
  suite(title: string, fn: () => void): void;
  test(title: string, fn: Body): void;
  suiteSetup(fn: Body): void;
  suiteTeardown(fn: Body): void;
  setup(fn: Body): void;
  teardown(fn: Body): void;
}

const tdd = globalThis as unknown as TddInterface;

export const suite = tdd.suite;
export const test = tdd.test;
export const suiteSetup = tdd.suiteSetup;
export const suiteTeardown = tdd.suiteTeardown;
export const setup = tdd.setup;
export const teardown = tdd.teardown;
