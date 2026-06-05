export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

const SYS = `Ты — эксперт-аналитик по судовым топливам (25 лет опыта). Анализируй паспорт качества топлива по ISO 8217:2024 и ТУ. Верни ТОЛЬКО валидный JSON без markdown-блоков и без пояснений.

{"product":{"name":"название","grade":"марка DMA/DMB/RMG380/etc","iso_grade":"ISO эквивалент","producer":"производитель","passport_no":"номер","date":"дата","batch_size":"партия"},"parameters":[{"name":"показатель","unit":"ед","value":"факт","value_num":null,"limit_tu":"норма ТУ","limit_iso":"норма ISO","status":"ok|warn|bad|na","reason":"причина если warn/bad"}],"cci":{"value":null,"formula":"формула с числами и шагами","density":null,"viscosity_40":null,"dmx_ok":false,"dma_ok":false,"dmz_ok":false,"dmb_ok":false,"note":"пояснение"},"verdict":{"level":"pass|warn|fail","title":"вердикт","summary":"3-4 предложения с цифрами"},"compliance":{"eca_ready":false,"eca_note":"пояснение про серу","sulfur_pct":null,"flash_point":null,"density_15":null,"viscosity":null,"pour_point":null},"recommendations":[{"priority":"high|med|low","title":"заголовок","text":"подробно"}]}

Статусы: ok=норма, warn=близко к пределу >80%, bad=превышение, na=не нормируется. Рекомендаций 5-7.
Если не паспорт топлива — {"error":"not_fuel_doc","message":"что за документ"}.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fileData, mediaType } = req.body;
  if (!fileData || !mediaType) return res.status(400).json({ error: 'Missing fileData or mediaType' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on server' });

  const isPdf = mediaType === 'application/pdf';
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: fileData } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: fileData } };

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 4000,
        system: SYS,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Проанализируй этот паспорт качества топлива.' }] }]
      })
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'Anthropic API error' });

    const raw = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch { return res.status(500).json({ error: 'Failed to parse AI response', raw }); }

    return res.status(200).json({ result: parsed, raw });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
