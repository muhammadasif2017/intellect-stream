import axios from 'axios';
import { CfWorkersAiService } from './cf-workers-ai.service';

jest.mock('axios');

describe('CfWorkersAiService', () => {
  let configMock: { getOrThrow: jest.Mock };
  let service: CfWorkersAiService;

  beforeEach(() => {
    configMock = {
      getOrThrow: jest.fn((key: string) =>
        key === 'CF_ACCOUNT_ID' ? 'acct-123' : 'token-abc',
      ),
    };
    service = new CfWorkersAiService(configMock as never);
    (axios.post as jest.Mock).mockReset();
  });

  it('calls the Llama Guard endpoint with the account id, bearer token, and message', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { success: true, errors: [], result: { response: 'safe' } },
    });

    await service.classify('hello world');

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/acct-123/ai/run/@cf/meta/llama-guard-3-8b',
      { messages: [{ role: 'user', content: 'hello world' }] },
      { headers: { Authorization: 'Bearer token-abc' } },
    );
  });

  it('returns approved with no categories for a safe response', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { success: true, errors: [], result: { response: 'safe' } },
    });

    const result = await service.classify('hello world');

    expect(result).toEqual({ verdict: 'approved', categories: [] });
  });

  it('returns rejected with parsed category codes for an unsafe response', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { success: true, errors: [], result: { response: 'unsafe\nS1,S6' } },
    });

    const result = await service.classify('bad content');

    expect(result).toEqual({ verdict: 'rejected', categories: ['S1', 'S6'] });
  });

  it('returns rejected with no categories when the unsafe response has no category line', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { success: true, errors: [], result: { response: 'unsafe' } },
    });

    const result = await service.classify('bad content');

    expect(result).toEqual({ verdict: 'rejected', categories: [] });
  });

  it('throws when the Cloudflare API reports failure', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { success: false, errors: [{ message: 'bad token' }], result: { response: '' } },
    });

    await expect(service.classify('hello')).rejects.toThrow('Cloudflare Workers AI error');
  });
});
