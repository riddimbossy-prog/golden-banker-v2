const { test, expect } = require('@playwright/test');
const path = require('path');

test('learning supervisor reduces repeated favourite-trap exposure without switching markets', async ({ page }) => {
  await page.addScriptTag({ path: path.join(__dirname, '..', 'learning-supervisor.js') });
  const result = await page.evaluate(() => {
    const match = {
      learningContext: {
        version: 'v193',
        favorite: { side: 'home', team: 'Pattern FC', odds: 1.45 },
        riskScore: 82,
        stabilityScore: 22,
        riskLevel: 'high',
        flags: ['FAVORITE_TRAP', 'PATTERN_BREAKER'],
        reasons: ['Pattern FC has repeatedly failed as a favourite.'],
        decision: { favoriteMarketAdjustment: -14, goalMarketAdjustment: -2, hardVetoFavorite: true },
        engineRules: {}
      }
    };
    return window.P2ULearningSupervisor.reviewDecision({
      engine: 'PurePPG Normal', primary: 'Home Win', market: 'Home Win', market_family: 'HOME_RESULT',
      score: 86, confidence: 86, bet: true, banker: true, reasons: [], warnings: []
    }, match);
  });
  expect(result.learning_review.applied).toBeTruthy();
  expect(result.original_candidate).toBe('Home Win');
  expect(result.primary).toBe('No Bet');
  expect(result.bet).toBeFalsy();
});

test('positive learning is capped and cannot manufacture a rejected pick', async ({ page }) => {
  await page.addScriptTag({ path: path.join(__dirname, '..', 'learning-supervisor.js') });
  const result = await page.evaluate(() => window.P2ULearningSupervisor.reviewDecision({
    engine: 'PurePPG Strict', primary: 'No Bet', market: 'No Bet', market_family: 'NEUTRAL',
    score: 74, confidence: 74, bet: false, banker: false, reasons: ['Original engine abstained.'], warnings: []
  }, { learningContext: { decision: { favoriteMarketAdjustment: 2 }, favorite: { side: 'home' }, flags: ['UPSET_RESISTANT'], reasons: [], riskScore: 10, stabilityScore: 90 } }));
  expect(result.primary).toBe('No Bet');
  expect(result.bet).toBeFalsy();
  expect(result.score).toBe(74);
});
