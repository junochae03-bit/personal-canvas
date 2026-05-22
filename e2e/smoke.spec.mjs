// Smoke E2E — 부트 → 프리셋 추가 → 갤러리 페인 진입.
// 회귀 막기에 가장 효과적인 1 시나리오 (목표: 빌드가 실제로 동작하는지 매번 확인).
//
// 실행: npm run e2e

import { test, expect } from '@playwright/test';

test.describe('NAI Studio smoke', () => {
  test.beforeEach(async ({ page }) => {
    // 콘솔 에러는 fail 조건 — but ignore expected NAI fetch errors (API key 없으니).
    const errors = [];
    page.on('pageerror', e => errors.push(e.message || String(e)));
    page.on('console', msg => {
      if(msg.type() === 'error' && !/novelai|fetch|net::/i.test(msg.text())){
        errors.push(`console.error: ${msg.text()}`);
      }
    });
    page._errors = errors;
  });

  test('부트 — 메인 UI 요소가 모두 보임', async ({ page }) => {
    await page.goto('/');
    // 핵심 셀렉터 — 한 번에 보이는 영역
    await expect(page.locator('#prompt')).toBeVisible({timeout: 10000});
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('#model')).toBeVisible();
    // 초기 부트 후 1초 안정화
    await page.waitForTimeout(500);
    expect(page._errors).toEqual([]);
  });

  test('프리셋 추가 — 모달 열기 → 저장 → 목록에 표시', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#prompt')).toBeVisible({timeout: 10000});

    // 프리셋 페인으로 전환
    await page.evaluate(() => window.setMainPane && window.setMainPane('presets'));
    await expect(page.locator('#presetGrid')).toBeVisible();

    // 프리셋 직접 주입 (UI 클릭 경로는 카테고리 탭 등 변경 가능성 있어 API-level)
    const NAME = `e2e_${Date.now()}`;
    await page.evaluate(async (name) => {
      await window.DB.presetPut('character', {name, text: 'e2e test prompt'});
      await window.loadPresetsFromDB();
    }, NAME);

    // 캐릭터 탭이 활성화되어 있어야 보임
    await page.evaluate(() => { window.state.presetType = 'character'; window.renderPresets(); });
    // 검색바에 이름 입력 → 필터링
    await page.fill('#presetSearch', NAME);
    await expect(page.locator(`.p-item[data-name="${NAME}"]`)).toBeVisible();
  });

  test('갤러리 페인 진입 + 빈 상태 메시지', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#prompt')).toBeVisible({timeout: 10000});

    await page.evaluate(() => window.setMainPane && window.setMainPane('gallery'));
    await expect(page.locator('#galleryGrid')).toBeVisible();

    // 빈 상태 안내 또는 카드가 있어야 함 (둘 중 하나)
    const grid = page.locator('#galleryGrid');
    const hasEmpty = await grid.locator('text=아직 생성된 이미지가 없습니다').count();
    const hasCards = await grid.locator('.g-item').count();
    expect(hasEmpty + hasCards).toBeGreaterThan(0);
  });

  test('만화 페인 — 레이아웃 5개 노출 + 선택', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#prompt')).toBeVisible({timeout: 10000});

    await page.evaluate(() => window.setMainPane && window.setMainPane('comic'));
    await expect(page.locator('[data-pane="comic"].main-pane')).toBeVisible();

    // 5개 레이아웃 카드 노출
    const cards = page.locator('.comic-layout-card');
    await expect(cards).toHaveCount(5);

    // 첫 카드 클릭 → aria-checked 가 'true' 로
    await cards.first().click();
    await expect(cards.first()).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#comicSelected')).toBeVisible();
    await expect(page.locator('#comicSelectedName')).not.toBeEmpty();

    // 컷별 prompt textarea 가 패널 수만큼 자동 생성 + 시작 버튼 + 비용 정보 노출
    const ptas = page.locator('.comic-prompt-ta');
    await expect(ptas.first()).toBeVisible();
    const count = await ptas.count();
    expect(count).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#comicStartBtn')).toBeVisible();
    await expect(page.locator('#comicCostInfo')).toContainText('Anlas');
    // 🎯 일관성 모드 토글이 기본 ON 상태로 노출되고 상태 한 줄이 보임
    await expect(page.locator('#comicConsistencyToggle')).toBeChecked();
    await expect(page.locator('#comicConsistencyStatus')).toContainText('시드');
  });

  test('말풍선 편집기 — 마크업 + 도구 노출 (모달 닫힘 상태)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#prompt')).toBeVisible({timeout: 10000});

    // 모달은 초기엔 닫혀있어야 (.open 클래스 없음)
    await expect(page.locator('#bubbleModal')).not.toHaveClass(/open/);
    // 도형 추가 버튼 3종이 DOM 에 존재
    await expect(page.locator('[data-bubble-add="round"]')).toHaveCount(1);
    await expect(page.locator('[data-bubble-add="spike"]')).toHaveCount(1);
    await expect(page.locator('[data-bubble-add="thought"]')).toHaveCount(1);
    // 텍스트 편집·삭제 버튼은 disabled 로 시작
    await expect(page.locator('#bubbleEditTextBtn')).toBeDisabled();
    await expect(page.locator('#bubbleDeleteBtn')).toBeDisabled();
    // 라이트박스 진입 버튼이 액션 사이드바에 존재
    await expect(page.locator('#lbBubbles')).toHaveCount(1);
  });

  test('CSP 메타 + 외부 script crossorigin 강제', async ({ page }) => {
    await page.goto('/');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').count();
    expect(csp).toBe(1);
    const externalScripts = await page.$$eval('script[src^="http"]', els =>
      els.map(el => ({src: el.src, crossorigin: el.crossOrigin}))
    );
    for(const s of externalScripts){
      expect(s.crossorigin, `${s.src} 에 crossorigin 누락`).toBeTruthy();
    }
  });
});
