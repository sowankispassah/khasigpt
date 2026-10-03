import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

async function radiusHarness(relativePath: string) {
  const source = await readFile(path.join(process.cwd(), relativePath), "utf8");
  const parsed = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statements: string[] = [];
  function visit(node: ts.Node) {
    const text = node.getText(parsed);
    if (
      (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(parsed) === "runSearchRef")) ||
      (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(parsed) === "useEffect" &&
        (text.includes("previousRadiusRef.current") || text.includes("runSearchRef.current = runSearch")))
    ) {
      statements.push(text);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  expect(statements.some(statement => statement.includes("previousRadiusRef.current"))).toBe(true);

  type Effect = { deps: unknown[]; cleanup?: () => void };
  const effects: Effect[] = [];
  const refs: { current: unknown }[] = [];
  const timers = new Map<number, { at: number; callback: () => void }>();
  const calls: { radiusOverride: number; callback: string }[] = [];
  let effectIndex = 0;
  let refIndex = 0;
  let timerId = 0;
  let now = 0;
  let pendingEffects: (() => void)[] = [];
  const timerApi = {
    setTimeout(callback: () => void, delay: number) {
      const id = ++timerId;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id: number) { timers.delete(id); },
  };
  const context = vm.createContext({
    ...timerApi,
    window: timerApi,
    useRef(value: unknown) {
      const index = refIndex++;
      if (!refs[index]) refs[index] = { current: value };
      return refs[index];
    },
    useEffect(callback: () => (() => void) | undefined, deps: unknown[]) {
      const index = effectIndex++;
      const previous = effects[index];
      if (previous && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
      pendingEffects.push(() => {
        previous?.cleanup?.();
        effects[index] = { deps, cleanup: callback() };
      });
    },
    location: { id: "shillong", latitude: 25.5788, longitude: 91.8933 },
    lastSearch: { query: "places to visit", categoryId: null, subcategoryId: null },
    previousRadiusRef: { current: 10 },
    requestedSearchKeyRef: { current: null },
    currentRequestIdRef: { current: null },
    requestIdRef: { current: null },
    abortRef: { current: null },
    createExploreSearchKey: JSON.stringify,
    searchKey: JSON.stringify,
    setRadiusDebouncing: () => {},
    setResponse: () => {},
    setError: () => {},
    setLoadingMode: () => {},
  });
  const code = ts.transpileModule(`function renderEffects() { ${statements.join("\n")} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInContext(code, context);
  return {
    calls,
    render(radius: number, callback: string) {
      effectIndex = 0;
      refIndex = 0;
      pendingEffects = [];
      context.radiusKm = radius;
      context.runSearch = ({ radiusOverride }: { radiusOverride: number }) => { calls.push({ radiusOverride, callback }); };
      vm.runInContext("renderEffects()", context);
      for (const effect of pendingEffects) effect();
    },
    advance(milliseconds: number) {
      now += milliseconds;
      for (const [id, timer] of timers) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.callback();
      }
    },
    unmount() { for (const effect of effects) effect.cleanup?.(); },
  };
}

for (const [platform, file] of [
  ["web", "components/explore/explore-page-client.tsx"],
  ["native", "native/src/screens/ExploreScreen.tsx"],
]) {
  test(`${platform} radius refresh survives the response-clearing render`, async () => {
    const harness = await radiusHarness(file);
    harness.render(10, "initial");
    harness.render(11, "slider");
    harness.render(11, "response cleared");
    harness.advance(649);
    expect(harness.calls).toEqual([]);
    harness.advance(1);
    expect(harness.calls).toEqual([{ radiusOverride: 11, callback: "response cleared" }]);
  });

  test(`${platform} rapid radius changes coalesce and unmount cancels the timer`, async () => {
    const harness = await radiusHarness(file);
    harness.render(10, "initial");
    harness.render(11, "first");
    harness.advance(200);
    harness.render(12, "second");
    harness.advance(200);
    harness.render(13, "final");
    harness.render(13, "response cleared");
    harness.advance(650);
    expect(harness.calls).toEqual([{ radiusOverride: 13, callback: "response cleared" }]);
    harness.render(14, "unmounted");
    harness.unmount();
    harness.advance(650);
    expect(harness.calls).toHaveLength(1);
  });
}
