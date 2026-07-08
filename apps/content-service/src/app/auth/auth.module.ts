import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InternalAuthGuard } from './internal-auth.guard';

@Module({
  imports: [JwtModule.register({})],
  providers: [InternalAuthGuard],
  exports: [InternalAuthGuard, JwtModule],
})
export class AuthModule {}
