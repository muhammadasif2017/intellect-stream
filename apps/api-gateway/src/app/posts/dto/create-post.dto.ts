import { IsNotEmpty, IsString } from 'class-validator';

// authorId is deliberately absent — the proxy derives it from the session,
// same reasoning as content-service's CreatePostDto.
export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  content!: string;
}
