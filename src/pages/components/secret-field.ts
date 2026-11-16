import type { Locator } from '@playwright/test';

/**
 * SQAF — Secret input (Stage 3 security adjustment). See ADR-0009 D16.
 *
 * `locator.fill(password)` records the value in the TITLE of the step
 * (`Fill "<password>"`), which Playwright writes to the HTML report of every
 * test, passing or failing, whatever the trace policy. Verified with
 * Playwright 1.65: neither `test.step(..., { box: true })` nor the trace
 * policy hides it.
 *
 * `fillSecret` keeps the actionability checks of `fill` (visible, enabled,
 * editable) by filling an EMPTY value first, then sets the real value in the
 * page and dispatches `input` and `change`, as typing would. The value is
 * passed as an `evaluate` argument, which does not appear in step titles.
 *
 * The value still lives in the DOM: the credential fixtures clear password
 * inputs and redact Playwright's errors after a failure (data.fixture.ts).
 */
export async function fillSecret(field: Locator, secret: string): Promise<void> {
  await field.fill('');
  const accepted = await field.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === value;
  }, secret);
  if (!accepted) {
    // The value is never part of the message.
    throw new Error('fillSecret: the field did not keep the value that was set (value not shown).');
  }
}
