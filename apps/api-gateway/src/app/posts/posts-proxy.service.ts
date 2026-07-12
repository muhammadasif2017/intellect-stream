import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface ProxyResponse {
  status: number;
  body: unknown;
  correlationId: string;
}

// Decision 4: Gateway -> Content Service transport is plain HTTP. This is a
// thin relay — it forwards method/path/body as-is and passes the upstream
// status/body straight back to the client, so content-service's REST
// contract (404s, validation 400s, etc.) is preserved rather than
// flattened into a generic proxy error shape.
@Injectable()
export class PostsProxyService {
  private readonly logger = new Logger(PostsProxyService.name);

  constructor(private readonly config: ConfigService) {}

  async forward(
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<ProxyResponse> {
    const baseUrl = this.config.getOrThrow<string>('CONTENT_SERVICE_URL');
    // Decision 8 / ADR-0013: the chain's correlationId is minted here, at the
    // edge — the gateway is the first thing a request touches, so every log
    // and message downstream (content → outbox → brokers → consumers) traces
    // back to one id the client also received.
    const correlationId = randomUUID();

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-correlation-id': correlationId,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      this.logger.error(
        `content-service unreachable: ${method} ${path} (correlation ${correlationId})`,
        err as Error,
      );
      throw new InternalServerErrorException('Content service unavailable');
    }

    // Stage marker for the dashboard's trace view: one positive-path log
    // per pipeline hop, always ending in correlationId=<id>.
    this.logger.log(
      `${method} ${path} forwarded, upstream ${res.status} correlationId=${correlationId}`,
    );

    if (res.status === 204) {
      return { status: res.status, body: undefined, correlationId };
    }

    const responseBody = await res.json().catch(() => undefined);
    return { status: res.status, body: responseBody, correlationId };
  }
}
