import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Field,
} from '../../components';
import { CopyButton } from '../../components/copy-button';
import { Textarea } from '../../components/textarea';
import { useCreatePost } from './use-create-post';

interface FiredTrigger {
  correlationId: string;
  postId: string;
  preview: string;
  at: Date;
}

const MAX_CONTENT = 10_000;

export function TriggerPage() {
  const [content, setContent] = useState('');
  const [history, setHistory] = useState<FiredTrigger[]>([]);
  const createPost = useCreatePost();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createPost.mutate(content, {
      onSuccess: ({ post, correlationId }) => {
        setContent('');
        /* Newest first — the row you just fired is the one you came to see. */
        setHistory((prev) => [
          {
            correlationId,
            postId: post.id,
            preview:
              post.content.length > 80
                ? `${post.content.slice(0, 80)}…`
                : post.content,
            at: new Date(),
          },
          ...prev,
        ]);
      },
    });
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Trigger</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Send a test post through the real gateway path — session, rate limit,
        proxy, outbox, brokers, all of it.
      </p>

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="New test post"
            description="POST /api/posts → content-service → outbox"
          />
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <Field
                label="Content"
                error={createPost.error?.message}
                hint={`Up to ${MAX_CONTENT.toLocaleString()} characters — it will be moderated by the AI pipeline`}
              >
                <Textarea
                  required
                  maxLength={MAX_CONTENT}
                  placeholder="Something for the moderation pipeline to chew on…"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </Field>
              <Button type="submit" isLoading={createPost.isPending}>
                Fire post
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Fired this session"
            description="Each id traces the post across every service"
          />
          {history.length === 0 ? (
            <EmptyState
              title="Nothing fired yet"
              description="Send a post and its correlation id will land here, ready to trace."
            />
          ) : (
            <ul className="divide-y divide-border">
              {history.map((item) => (
                <li
                  key={item.correlationId}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">
                      {item.correlationId}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.at.toLocaleTimeString()} · {item.preview}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <CopyButton text={item.correlationId} />
                    <Link
                      to={`/trace?correlationId=${item.correlationId}`}
                      className="rounded-md px-3 py-1.5 text-sm font-medium text-primary hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Trace
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
