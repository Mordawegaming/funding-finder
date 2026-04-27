const fs = require('fs');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a UK charity funding expert helping a small charity (5 employees) in Thanet, Kent. They offer employment training, back-to-work programmes, CSCS construction training, first aid training, and community programmes.

Search for funding opportunities CURRENTLY OPEN in 2026. Return ONLY valid JSON, no markdown, no explanation:
{
  "opportunities": [
    {
      "name": "Funder name",
      "description": "1-2 sentences on what it funds and why it fits",
      "amount": "Grant range e.g. £2,000-£10,000",
      "deadline": "Deadline or Rolling",
      "tags": ["tag1", "tag2"],
      "url": "https://apply.link"
    }
  ],
  "summary": "One sentence summary of today's funding landscape"
}

Include 6-10 real currently open opportunities only.`;

async function updateGrants() {
  console.log(`[${new Date().toISOString()}] Starting daily grant update...`);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const body = JSON.stringify({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{
      role: 'user',
      content: `Today is ${today}. Find currently open charity grant funding for a small training and employment charity in Thanet, Kent. Return JSON only.`
    }]
  });

  console.log('Calling Claude API...');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body
  });

  console.log(`API response status: ${response.status}`);

  if (!response.ok) {
    const err = await response.text();
    console.error('API error:', err);
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  console.log('Response received, parsing...');

  const textBlocks = data.content.filter(b => b.type === 'text');
  if (!textBlocks.length) throw new Error('No text in response');

  const rawText = textBlocks.map(b => b.text).join('\n');
  const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.opportunities || !Array.isArray(parsed.opportunities)) {
    throw new Error('Invalid response structure');
  }

  const output = {
    updated_at: new Date().toISOString(),
    updated_date: today,
    opportunities: parsed.opportunities,
    summary: parsed.summary || null,
    count: parsed.opportunities.length
  };

  fs.writeFileSync('./data.json', JSON.stringify(output, null, 2));
  console.log(`[SUCCESS] Wrote ${output.count} opportunities to data.json`);
}

updateGrants().catch(err => {
  console.error('[FAILED]', err.message);
  fs.writeFileSync('./data.json', JSON.stringify({
    updated_at: new Date().toISOString(),
    error: true,
    opportunities: [],
    summary: 'Daily update encountered an error. Please use the AI Search tab.'
  }, null, 2));
  process.exit(1);
});
