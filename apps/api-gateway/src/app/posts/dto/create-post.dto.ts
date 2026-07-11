import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// authorId is deliberately absent — the proxy derives it from the session,
// same reasoning as content-service's CreatePostDto.
export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  // Capped so a single post can't blow up the paid moderation LLM call it
  // triggers downstream (cost/DoS amplification) — see content-service's
  // CreatePostDto for the matching defense-in-depth cap.
  @MaxLength(10000)
  content!: string;
}
