export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const { funder } = req.body;
  if (!funder) return res.status(400).json({ error: 'Funder data required' });

  const CHARITY_PROFILE = `
Organisation: A small registered charity based in Thanet, Kent
Staff: 5 employees
Services: Employment training, back-to-work programmes, CSCS construction training, first aid training, community programmes
Beneficiaries: Unemployed adults, people returning to work, local community members in Thanet
Location: Thanet, Kent — one of the most deprived coastal areas in England
Annual income: Under £250,000`;

  const prompt = `You are an expert bid writer helping a small charity apply for funding.

CHARITY PROFILE:
${CHARITY_PROFILE}

FUNDER DETAILS:
Name: ${funder.name}
Description: ${funder.description}
What they fund: ${funder.what_they_fund || 'Not specified'}
What they do NOT fund: ${funder.what_they_dont_fund || 'Not specified'}
Funder priorities: ${funder.funder_priorities || 'Not specified'}
Grant amount: ${funder.amount}
Application process: ${funder.application_process || 'Not specified'}
Website: ${funder.url}

Write a bespoke funding application template. Use the funder's OWN language and terminology throughout. Mirror their words back to them. Make every section specific to what THIS funder cares about. Use [SQUARE BRACKETS] for parts they need to fill in.

---
BID TEMPLATE: ${funder.name}
Grant amount applying for: [AMOUNT]
---

1. ABOUT OUR ORGANISATION
[2-3 paragraphs tailored to what this funder values]

2. THE NEED WE ARE ADDRESSING
[2-3 paragraphs using evidence about Thanet deprivation and employment needs]

3. OUR PROPOSED PROJECT
[3-4 paragraphs describing their work in the funder's language]

4. WHO WILL BENEFIT
[1-2 paragraphs describing beneficiaries in terms this funder cares about]

5. ACTIVITIES AND TIMELINE
[Structured list of activities and timeline]

6. EXPECTED OUTCOMES AND IMPACT
[Outcomes using this funder's measurement language]

7. BUDGET OUTLINE
[Suggested budget structure with placeholder amounts]

8. SUSTAINABILITY
[1 paragraph on how work continues beyond this grant]

9. WHY THIS FUNDER IS THE RIGHT PARTNER
[1 paragraph connecting the charity's mission to this funder's vision]

---
TIPS FOR THIS APPLICATION:
[3-5 specific tips for applying to this particular funder]
---`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) return res.status(500).json({ error: 'Failed to generate template' });
    const data = await response.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    return res.status(200).json({ template: text });

  } catch(err) {
    return res.status(500).json({ error: 'Server error' });
  }
}
