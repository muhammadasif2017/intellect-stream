import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ModerationVerdict } from '@intellect-stream/shared-dtos';

const MODEL = '@cf/meta/llama-guard-3-8b';

export interface ClassificationResult {
  verdict: ModerationVerdict;
  categories: string[];
}

interface CfWorkersAiResponse {
  success: boolean;
  errors: unknown[];
  result: { response: string };
}

@Injectable()
export class CfWorkersAiService {
  private readonly logger = new Logger(CfWorkersAiService.name);

  constructor(private readonly config: ConfigService) {}

  async classify(content: string): Promise<ClassificationResult> {
    const accountId = this.config.getOrThrow<string>('CF_ACCOUNT_ID');
    const apiToken = this.config.getOrThrow<string>('CF_API_TOKEN');
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;

    const { data } = await axios.post<CfWorkersAiResponse>(
      url,
      { messages: [{ role: 'user', content }] },
      { headers: { Authorization: `Bearer ${apiToken}` } },
    );

    if (!data.success) {
      throw new Error(`Cloudflare Workers AI error: ${JSON.stringify(data.errors)}`);
    }

    return this.parseVerdict(data.result.response);
  }

  // Llama Guard 3 8B responds with "safe" or "unsafe\nS1,S6" (category codes).
  private parseVerdict(raw: string): ClassificationResult {
    const trimmed = raw.trim();
    if (trimmed.toLowerCase().startsWith('safe')) {
      return { verdict: 'approved', categories: [] };
    }

    const [, categoryLine] = trimmed.split('\n');
    const categories = categoryLine
      ? categoryLine.split(',').map((c) => c.trim()).filter(Boolean)
      : [];

    this.logger.warn(`Content flagged unsafe: ${categories.join(', ') || '(no category line)'}`);
    return { verdict: 'rejected', categories };
  }
}
