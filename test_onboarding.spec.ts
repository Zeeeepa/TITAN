import { test, expect } from '@playwright/test';

test('Verify Onboarding Wizard', async ({ page }) => {
  // Clear the profile so the wizard shows up
  await page.evaluate(async () => {
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', technicalLevel: 'intermediate' })
    });
  });

  await page.goto('http://127.0.0.1:48420/');

  // Wait for the modal to be visible
  const modal = page.locator('#onboarding-modal');
  await expect(modal).toHaveClass(/show/);

  // Step 1
  await page.fill('#ob-name', 'Test User');
  await page.selectOption('#ob-level', 'expert');
  await page.click('#ob-btn-next');

  // Step 2
  await expect(page.locator('#ob-step-2')).toHaveClass(/active/);
  // Click the Local provider box
  await page.locator('.provider-box').first().click();
  await page.click('#ob-btn-next');

  // Step 3
  await expect(page.locator('#ob-step-3')).toHaveClass(/active/);
  await page.selectOption('#ob-autonomy', 'autonomous');
  const finishBtn = page.locator('#ob-btn-next');
  await expect(finishBtn).toHaveText(/Finish Setup/);
  await finishBtn.click();

  // Modal should disappear
  await expect(modal).not.toHaveClass(/show/);
});

test('Verify Model Optgroups', async ({ page }) => {
  await page.goto('http://127.0.0.1:48420/');
  
  // Go to Settings -> AI & Model
  await page.click('text="⚙️ Settings"');
  
  // Check that optgroups exist
  const optgroups = page.locator('#cfg-model optgroup');
  await expect(optgroups).toHaveCount(4); // anthropic, openai, google, ollama

  const labels = await optgroups.evaluateAll(elements => elements.map(e => e.label));
  expect(labels).toContain('CLOUD (ANTHROPIC)');
  expect(labels).toContain('LOCAL (Ollama)');
});
