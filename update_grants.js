const fs = require('fs');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set.');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a UK charity funding research expert. Search broadly for currently open UK charity grant funding opportunities across all sectors and sizes.

The charity using this tool is in Thanet, Kent with 5 employees offering employment training, back-to-work programmes, CSCS construction training, first aid training, and community programmes. But find ALL types of UK funding — they want to see the full landscape and filter it themselves.

Search for 15-20 currently open opportunities covering local, regional and national funders of all sizes.

Return ONLY raw JSON with no markdown, no code fences, just the JSON object:
{
  "opportunities": [
    {
      "name": "Full funder or programme name",
      "description": "2-3 sentence description of what they fund",
      "amount": "Grant range e.g. £2,000-£10,000",
      "deadline": "Deadline date, Rolling, or Opens Month Year",
      "tags": ["tag1", "tag2", "tag3"],
      "url": "https://apply-link.com",
      "match": "high or medium or explore",
      "location_scope": "local or regional or national",
      "size_category": "small or medium or large or major",
      "fund_types": ["training", "employment", "community", "construction", "first-aid", "core-costs", "capital"],
      "funder_priorities": "2-3 sentences on what this funder cares most about, their mission and key language they use",
      "what_they_fund": "Specific description of what they will fund",
      "what_they_dont_fund": "Specific description of what they will NOT fund",
      "application_process": "How to apply, stages, timelines"
    }
  ],
  "summary": "One sentence overview of today's UK funding landscape for small training charities"
}

Match: high=directly relevant to training/employment/community in Kent, medium=nationally relevant, explore=worth knowing about.
Size: small=under £10k, medium=£10k-£50k, large=£50k-£100k, major=over £100k.
Only include genuinely open opportunities.`;

async function updateGrants() {
  console.log(`[${new Date().toISOString()}] Starting daily grant update...`);
  const today = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
messages: [{ role: 'user', content: `Today is ${today}. Search broadly for all currently open UK charity grant funding opportunities in the UK. You MUST return ONLY a raw JSON object. Do not use markdown. Do not use code fences. Do not write any explanation. Start your response with { and end with }. Nothing before the first { and nothing after the last }.` }]
    })
  });

  console.log(`API status: ${response.status}`);
  if (!response.ok) { const e = await response.text(); throw new Error(`HTTP ${response.status}: ${e}`); }

  const data = await response.json();
  const textBlocks = data.content.filter(b => b.type === 'text');
  if (!textBlocks.length) throw new Error('No text in response');

  const rawText = textBlocks.map(b => b.text).join('\n');
  const cleaned = rawText.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.opportunities || !Array.isArray(parsed.opportunities)) throw new Error('Invalid structure');

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
    summary: 'Daily update failed. Please try again.'
  }, null, 2));
  process.exit(1);
});
