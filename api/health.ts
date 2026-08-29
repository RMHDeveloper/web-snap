import { aiConfigured } from './_lib/gemini';
import { sendJson } from './_lib/http';

export default function handler(_req: any, res: any): void {
  sendJson(res, 200, { aiEnabled: aiConfigured() });
}
