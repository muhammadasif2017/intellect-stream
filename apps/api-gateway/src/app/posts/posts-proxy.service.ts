import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProxyResponse {
  status: number;
  body: unknown;
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

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      this.logger.error(`content-service unreachable: ${method} ${path}`, err as Error);
      throw new InternalServerErrorException('Content service unavailable');
    }

    if (res.status === 204) {
      return { status: res.status, body: undefined };
    }

    const responseBody = await res.json().catch(() => undefined);
    return { status: res.status, body: responseBody };
  }
}
