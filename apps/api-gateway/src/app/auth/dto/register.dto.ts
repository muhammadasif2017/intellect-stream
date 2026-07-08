import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  // bcrypt truncates at 72 bytes; a reasonable minimum keeps weak passwords
  // out without pretending to be a full strength policy.
  @IsString()
  @MinLength(8)
  password!: string;
}
