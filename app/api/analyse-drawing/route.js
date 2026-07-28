import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const client = new Anthropic();

function buildPrompt(projectName, scale, unit, calibration) {
  const calibInfo = calibration
    ? `Scale calibration has been set by the user: 1 pixel = ${(1 / calibration.pixelsPerRealUnit).toFixed(6)} ${calibration.calibUnit}. Use this precise calibration for all measurements.`
    : `Drawing scale is declared as ${scale}. Use this scale to estimate measurements visually.`;

  return `You are an expert Quantity Surveyor performing a professional takeoff analysis on a construction drawing.

PROJECT: ${projectName || 'Unnamed Project'}
MEASUREMENT UNIT: ${unit}
${calibInfo}

TASK: Carefully analyse this drawing and identify ALL visible construction elements. Prioritise:

1. Internal Walls / Drylining (A-WALL-INT) — measure total LINEAR METRES of partition walls
2. Flooring (A-FLOOR) — measure total AREA in m² (gross floor area)
3. Ceiling (A-CEIL) — measure total AREA in m² (ceiling plan area, same as floor)
4. Painting / Decorating (A-DECO) — measure AREA in m² (all painted wall faces + ceilings)
5. External Walls / Brickwork (A-WALL-EXT / A-BRICKWORK) — measure LINEAR METRES or m²
6. Identify any other visible construction elements (doors, windows, stairs, structural columns, etc.)

MEASUREMENT RULES (follow strictly):
- Walls: measured NET of door and window openings
- Floors: use gross floor area
- Ceilings: plan area (equals floor area of each room)
- Painting: total of wall face areas (net of openings) plus ceiling areas combined
- For linear elements: measure the centre-line length

CONFIDENCE LEVELS:
- HIGH: Element is clearly visible and dimension is confidently extractable
- MEDIUM: Element visible but some estimation required
- LOW: Element inferred or partially visible / obscured

For regions: provide approximate bounding boxes as proportions of image dimensions (x, y, w, h all between 0.0 and 1.0) showing where each element type is located.

Return ONLY valid JSON — no markdown fences, no explanation, no text before or after the JSON object:

{
  "elements": [
    {
      "elementType": "Internal Walls / Drylining",
      "layerCode": "A-WALL-INT",
      "colorHex": "#ef4444",
      "totalQuantity": 45.2,
      "unit": "m",
      "confidence": "HIGH",
      "description": "Internal 100mm metal stud partition walls",
      "specNote": "Metal stud, plasterboard both sides",
      "regions": [{"x": 0.1, "y": 0.2, "w": 0.6, "h": 0.05}]
    }
  ],
  "rooms": [
    {
      "name": "Living Room",
      "area": 25.4,
      "perimeter": 20.1,
      "elements": ["A-WALL-INT", "A-FLOOR", "A-CEIL"]
    }
  ],
  "takeoff": [
    {
      "ref": 1,
      "elementType": "Internal Walls / Drylining",
      "layerCode": "A-WALL-INT",
      "description": "A-WALL-INT — Internal 100mm partition walls",
      "quantity": 45.2,
      "unit": "m",
      "comments": "Measured net of door openings. Metal stud partition."
    }
  ],
  "summary": "Brief description of the drawing and what was found."
}`;
}

function extractJSON(text) {
  // Try markdown fence first
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return JSON.parse(fenceMatch[1].trim());

  // Try raw JSON object (greedy from first { to last })
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }

  throw new Error('No JSON object found in AI response');
}

export async function POST(request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Server configuration error: ANTHROPIC_API_KEY is not set. Please add it to your .env.local file.' },
        { status: 500 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body.' }, { status: 400 });
    }

    const { base64, mediaType, projectName, scale, unit, calibration } = body;

    if (!base64 || !mediaType) {
      return NextResponse.json(
        { error: 'Missing required fields: base64 and mediaType are required.' },
        { status: 400 }
      );
    }

    const isImage = mediaType.startsWith('image/');
    const isPDF = mediaType === 'application/pdf';

    if (!isImage && !isPDF) {
      return NextResponse.json(
        { error: `Unsupported file type: ${mediaType}. Please upload a PDF, PNG, JPG, or WebP file.` },
        { status: 400 }
      );
    }

    const prompt = buildPrompt(projectName, scale, unit, calibration);

    const contentBlock = isImage
      ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [contentBlock, { type: 'text', text: prompt }],
        },
      ],
    });

    const responseText = message.content[0]?.text ?? '';

    let result;
    try {
      result = extractJSON(responseText);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr.message);
      console.error('Raw response (first 800 chars):', responseText.substring(0, 800));
      return NextResponse.json(
        { error: 'Failed to parse the AI response as JSON. Please try again.' },
        { status: 500 }
      );
    }

    // Normalise and validate structure
    const normalised = {
      elements: Array.isArray(result.elements) ? result.elements : [],
      rooms: Array.isArray(result.rooms) ? result.rooms : [],
      takeoff: Array.isArray(result.takeoff) ? result.takeoff : [],
      summary: typeof result.summary === 'string' ? result.summary : '',
    };

    // Ensure every takeoff row has a ref
    normalised.takeoff = normalised.takeoff.map((row, i) => ({
      ...row,
      ref: row.ref ?? i + 1,
    }));

    return NextResponse.json(normalised);
  } catch (err) {
    console.error('Analysis error:', err);

    if (err.status === 401 || err.name === 'AuthenticationError' || (err.message || '').toLowerCase().includes('authentication')) {
      return NextResponse.json(
        { error: '401 API key error — your ANTHROPIC_API_KEY is invalid or missing. Open .env.local, paste your key (sk-ant-...), save, and restart the server.' },
        { status: 401 }
      );
    }

    if (err.status === 413 || (err.message || '').toLowerCase().includes('too large')) {
      return NextResponse.json(
        { error: 'The drawing file is too large to process. Please use a compressed PDF or a smaller image.' },
        { status: 413 }
      );
    }

    return NextResponse.json(
      { error: err.message ?? 'An unexpected error occurred during analysis.' },
      { status: 500 }
    );
  }
}
