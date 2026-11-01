/** Bounded polling; diagnostics are evaluated only on failure and must contain no secrets. */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  diagnostics: () => Promise<unknown>,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  } while (Date.now() < deadline);
  throw new Error(`Condition timed out (${timeoutMs} ms): ${JSON.stringify(await diagnostics())}`);
}
