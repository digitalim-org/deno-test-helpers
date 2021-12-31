interface Test {
  name: string;
  fn: (t: Deno.TestContext) => void | Promise<void>;
}

type Hook = () => void | Promise<void>;
type HookPromise = () => Promise<void>;
type HookBucket = Record<string, HookPromise>;

const noOpHookPromise: HookPromise = () => Promise.resolve();
const isPromise = (candidate: unknown) => candidate instanceof Promise;
let groupCursor: string;

class TestRunner {
  #tests: Record<string, Test[]> = {};
  #beforeEach: HookBucket = {
    global: noOpHookPromise,
  };
  #afterEach: HookBucket = {
    global: noOpHookPromise,
  };

  setBeforeEach(fn: HookPromise, group: string) {
    this.#beforeEach[group] = fn;
  }

  setAfterEach(fn: HookPromise, group: string) {
    this.#afterEach[group] = fn;
  }

  addTest(test: Test, group: string) {
    this.#tests[group] = this.#tests[group] || [];
    this.#tests[group].push(test);
  }

  async runGroup(group: string) {
    await Promise.all(
      this.#tests[group].map((test) =>
        this.testWrapper(
          test,
          this.#beforeEach[group] || noOpHookPromise,
          this.#afterEach[group] || noOpHookPromise,
        )
      ),
    );
  }

  testWrapper(test: Test, _beforeEach: HookPromise, _afterEach: HookPromise) {
    Deno.test(test.name, async (t) => {
      await this.#beforeEach.global();
      await _beforeEach();
      const res = test.fn(t);
      if (res instanceof Promise) {
        await res;
      }
      await _afterEach();
      await this.#afterEach.global();
    });
  }
}

const testRunner = new TestRunner();

export const describe = (
  name: string,
  fn: () => void,
) => {
  groupCursor = name;
  fn();
  testRunner.runGroup(name);
};

export const it = (
  name: string,
  fn: (t: Deno.TestContext) => void | Promise<void>,
) => {
  testRunner.addTest({ name, fn }, groupCursor);
};

const promiseWrapper = (fn: (...args: unknown[]) => void | Promise<void>) =>
  (...args: unknown[]) =>
    new Promise<void>((resolve, reject) => {
      const maybePromise = fn(...args);
      if (isPromise(maybePromise)) {
        (maybePromise as Promise<void>).then(resolve).catch(reject);
      } else {
        resolve();
      }
    });

export const afterEach = (fn: Hook) => {
  testRunner.setAfterEach(promiseWrapper(fn), groupCursor || "global");
};

export const beforeEach = (fn: Hook) => {
  testRunner.setBeforeEach(promiseWrapper(fn), groupCursor || "global");
};
