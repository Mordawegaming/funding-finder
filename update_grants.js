// update_grants.js
// Runs daily at 8am UK time via GitHub Actions.
// Calls Claude API with web search to find currently open grants,
// then writes results to data.json which the app reads.

const fs = require('fs');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a UK charity funding expert. You are helping a small charity (5 employees) based in Thanet, Kent. They offer: employment training, back-to-work programmes, CSCS construction training, first aid training, and community programmes.

Search for funding opportunities that are CURRENTLY OPEN (i.e. accepting applications right now or opening soon in 2026). Focus on:
- Local funders covering Kent and/or Thanet
- National funders relevant to employment training, skills, and community work
- Government-backed programmes (DWP, DLUHC, UKSPF, etc.)
- Construction training funding (CITB, Skills England)
- First aid training grants
- Small grants specifically for organisations with income under £250k

Return ONLY a valid JSON object with this exact structure — no markdown, no explanation, just the JSON:
{
  "opportunities": [
    {
      "name": "Funder / programme name",
      "description": "1-2 sentence description of what it funds and why it fits this charity",
      "amount": "Grant range e.g. £2,000–£10,000",
      "deadline": "Deadline or 'Rolling' or 'Opens Month 2026'",
      "tags": ["tag1", "tag2"],
      "url": "https://apply.link"
    }
  ],
  "summary": "One sentence summary of the funding landscape today for this charity type"
}

Include 6-10 opportunities. Only include ones that are genuinely open or opening within the next 3 months. If you cannot confirm a deadline, say 'Check website'. Do not include closed funds.`;

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const { default: fetch } = await import('node-fetch');
      const res = await fetch(url, options);
      if (res.ok) return res;
      console.warn(`Attempt ${i + 1} failed: HTTP ${res.status}`);
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 5000 * (i + 1)));
      }
    } catch (e) {
      console.warn(`Attempt ${i + 1} error: ${e.message}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('All retries failed');
}

async function updateGrants() {
  console.log(`[${new Date().toISOString()}] Starting daily grant update...`);

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const requestBody = {
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [
      {
        role: 'user',
        content: `Today is ${today}. Search for currently open charity grant funding opportunities for a small training and employment charity in Thanet, Kent, UK. Return the JSON as specified.`
      }
    ]
  };

  console.log('Calling Claude API with web search...');

  const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(requestBody)
  });

  const data = await response.json();

  const textBlocks = data.content.filter(b => b.type === 'text');
  if (!textBlocks.length) {
    throw new Error('No text content in API response');
  }

  const rawText = textBlocks.map(b => b.text).join('\n');
  console.log('Raw response received, parsing JSON...');

  // Strip any markdown code fences if present
  const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Extract JSON from the response
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('Could not find JSON in response. Raw text:', rawText.substring(0, 500));
    throw new Error('No JSON found in response');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('JSON parse error:', e.message);
    console.error('Attempted to parse:', jsonMatch[0].substring(0, 500));
    throw new Error('Failed to parse JSON from response');
  }

  // Validate structure
  if (!parsed.opportunities || !Array.isArray(parsed.opportunities)) {
    throw new Error('Invalid response structure — missing opportunities array');
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
  console.log(`Summary: ${output.summary}`);
}

updateGrants().catch(err => {
  console.error('[FAILED] Grant update failed:', err.message);
  // Write a fallback data.json so the app shows a useful message
  const fallback = {
    updated_at: new Date().toISOString(),
    error: true,
    opportunities: [],
    summary: 'Daily update encountered an error. Please check the AI Search tab for live results.'
  };
  fs.writeFileSync('./data.json', JSON.stringify(fallback, null, 2));
  process.exit(1);
});
