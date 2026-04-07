import { Context } from 'koa';
import { ProxyModel } from '../models/Proxy';
import { ProxyService } from '../services/ProxyService';
import { normalizeProxyDraft, validateProxyDraft } from '../services/proxySupport';
import { success, fail } from '../utils/response';

const model = new ProxyModel();
const proxyService = new ProxyService();

export class ProxyController {
  async list(ctx: Context) {
    success(ctx, model.list());
  }

  async create(ctx: Context) {
    const body = normalizeProxyDraft(ctx.request.body as any);
    const validationError = validateProxyDraft(body);
    if (validationError) return fail(ctx, validationError, 400);
    const proxy = model.create(body);
    success(ctx, proxy);
  }

  async update(ctx: Context) {
    const id = parseInt(ctx.params.id);
    const current = model.getById(id);
    if (!current) return fail(ctx, 'Proxy not found', 404);
    const body = normalizeProxyDraft({ ...current, ...(ctx.request.body as any) });
    const validationError = validateProxyDraft(body);
    if (validationError) return fail(ctx, validationError, 400);
    const proxy = model.update(id, body);
    if (!proxy) return fail(ctx, 'Proxy not found', 404);
    success(ctx, proxy);
  }

  async delete(ctx: Context) {
    const id = parseInt(ctx.params.id);
    if (!model.delete(id)) return fail(ctx, 'Proxy not found', 404);
    success(ctx, { deleted: true });
  }

  async test(ctx: Context) {
    const id = parseInt(ctx.params.id);
    const proxy = model.getById(id);
    if (!proxy) return fail(ctx, 'Proxy not found', 404);
    try {
      const result = await proxyService.testProxy(proxy);
      model.updateTestResult(id, result.ip, result.status);
      success(ctx, result);
    } catch (err: any) {
      model.updateTestResult(id, '', 'failed');
      fail(ctx, `Proxy test failed: ${err.message}`);
    }
  }

  async setDefault(ctx: Context) {
    const id = parseInt(ctx.params.id);
    const proxy = model.setDefault(id);
    if (!proxy) return fail(ctx, 'Proxy not found', 404);
    success(ctx, proxy);
  }
}
