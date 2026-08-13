import { describe, expect, it } from 'vitest';
import {
  MATH_MARKETING_SYSTEM_PROMPT,
  mathMarketingFaqs,
  mathMarketingPricingFetchHint,
  resolveMathMarketingPricingUrl,
} from '@/lib/math-marketing-content';
import { mathMarketingMcpToolIds } from '@/lib/math-marketing-mcp';

describe('math-marketing-content', () => {
  it('usa la URL pública de /pricing por defecto', () => {
    expect(resolveMathMarketingPricingUrl()).toBe('https://botiva.space/pricing');
  });

  it('RAG indica web_fetch_page sin cifras hardcodeadas', () => {
    const hint = mathMarketingPricingFetchHint();
    expect(hint).toContain('web_fetch_page');
    expect(hint).toContain('https://botiva.space/pricing');
    expect(hint).not.toMatch(/\$\d+\/mes/);
  });

  it('FAQ de Team apunta a lectura dinámica', () => {
    const faq = mathMarketingFaqs().find((f) => /Team/i.test(f.question));
    expect(faq?.answer).toMatch(/web_fetch_page/i);
    expect(faq?.answer).not.toMatch(/\$\d+/);
  });

  it('system prompt exige leer precios antes de responder', () => {
    expect(MATH_MARKETING_SYSTEM_PROMPT).toMatch(/web_fetch_page/i);
    expect(MATH_MARKETING_SYSTEM_PROMPT).toMatch(/Prohibido/i);
  });

  it('expone solo web_fetch_page como MCP', () => {
    expect(mathMarketingMcpToolIds()).toEqual(['mcp:webSearch:web_fetch_page']);
  });
});
