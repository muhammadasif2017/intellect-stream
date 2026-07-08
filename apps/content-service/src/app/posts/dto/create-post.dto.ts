import { IsNotEmpty, IsString } from 'class-validator';

// authorId is deliberately absent — derived from the verified internal
// token (InternalAuthGuard sets request.userId), never trusted from the
// client body. See gateway/route-to-content-service PR.
export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  content!: string;
}