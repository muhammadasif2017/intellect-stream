import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InternalTokenVerifierService } from './internal-token-verifier.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [InternalTokenVerifierService],
  exports: [InternalTokenVerifierService],
})
export class AuthModule {}
