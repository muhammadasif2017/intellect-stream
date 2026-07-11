import { useMutation } from '@tanstack/react-query';

import { apiFetchWithHeaders } from '../../lib/api';

export interface CreatedPost {
  id: string;
  content: string;
  status: string;
}

export interface TriggerResult {
  post: CreatedPost;
  correlationId: string;
}

export function useCreatePost() {
  return useMutation({
    mutationFn: async (content: string): Promise<TriggerResult> => {
      const { data, headers } = await apiFetchWithHeaders<CreatedPost>(
        '/api/posts',
        { method: 'POST', body: JSON.stringify({ content }) },
      );
      return {
        post: data,
        correlationId: headers.get('x-correlation-id') ?? 'unknown',
      };
    },
  });
}
