import { Context } from 'koa';
import { config } from '../config';
import { getRuntimeCapabilities } from '../runtime/capabilities';
import { success } from '../utils/response';

export class RuntimeController {
  async capabilities(ctx: Context) {
    success(ctx, getRuntimeCapabilities(config.runtime));
  }
}
