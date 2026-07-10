import { Module } from '@nestjs/common';
import { SocketRegistryService } from './socket-registry.service';

@Module({
  providers: [SocketRegistryService],
  exports: [SocketRegistryService],
})
export class RegistryModule {}
