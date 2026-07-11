import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// authorId is deliberately absent — derived from the verified internal
// token (InternalAuthGuard sets request.userId), never trusted from the
// client body. See gateway/route-to-content-service PR.
export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  // Defense-in-depth cap matching api-gateway's CreatePostDto — this
  // service shouldn't trust the gateway to have enforced it (gateway
  // compromise/bypass shouldn't cascade into an unbounded paid LLM call).
  @MaxLength(10000)
  content!: string;
}