import { useState, useEffect } from 'react';
import type { Proxy } from '../../types';

interface Props {
  open: boolean;
  proxy: Proxy | null;
  onClose: () => void;
  onSave: (data: Partial<Proxy>) => Promise<void>;
}

const initialForm = {
  name: '',
  provider: 'custom' as Proxy['provider'],
  type: 'socks5' as Proxy['type'],
  host: '',
  port: 1080,
  username: '',
  password: '',
  is_default: false,
};

export default function ProxyForm({ open, proxy, onClose, onSave }: Props) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (proxy) {
      setForm({
        name: proxy.name,
        provider: proxy.provider || 'custom',
        type: proxy.type,
        host: proxy.host,
        port: proxy.port,
        username: proxy.username || '',
        password: proxy.password || '',
        is_default: proxy.is_default,
      });
    } else {
      setForm(initialForm);
    }
  }, [proxy, open]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1';
  const applyProviderPreset = (provider: Proxy['provider']) => {
    setForm(f => {
      if (provider === 'cloudflare-warp') {
        return {
          ...f,
          provider,
          name: f.name || 'Cloudflare WARP',
          type: f.type === 'http' ? 'http' : 'socks5',
          host: '127.0.0.1',
          port: 40000,
        };
      }

      return {
        ...f,
        provider,
      };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
          {proxy ? '编辑代理' : '添加代理'}
        </h2>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>预设</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => applyProviderPreset('custom')}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  form.provider === 'custom'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
              >
                <div className="text-sm font-semibold">自定义代理</div>
                <div className="mt-1 text-xs opacity-80">手动填写任意 HTTP / SOCKS5 代理</div>
              </button>
              <button
                type="button"
                onClick={() => applyProviderPreset('cloudflare-warp')}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  form.provider === 'cloudflare-warp'
                    ? 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-400 dark:bg-orange-950/40 dark:text-orange-200'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
              >
                <div className="text-sm font-semibold">Cloudflare WARP</div>
                <div className="mt-1 text-xs opacity-80">自动填入本地代理默认地址，支持专用连通性检测</div>
              </button>
            </div>
          </div>
          <div>
            <label className={labelCls}>名称</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="我的代理" />
          </div>
          <div>
            <label className={labelCls}>类型</label>
            <div className="flex gap-4 mt-1">
              {(['socks5', 'http'] as const).map(t => (
                <label key={t} className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="proxyType"
                    checked={form.type === t}
                    onChange={() => setForm(f => ({ ...f, type: t }))}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300 uppercase">{t}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>主机</label>
              <input type="text" value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} className={inputCls} placeholder="127.0.0.1" />
            </div>
            <div>
              <label className={labelCls}>端口</label>
              <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: Number(e.target.value) }))} className={inputCls} placeholder="1080" />
            </div>
          </div>
          {form.provider === 'cloudflare-warp' && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              WARP 本地代理通常使用 <span className="font-mono">127.0.0.1:40000</span>。如果你在本机改过监听配置，可以继续手动覆盖。
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>用户名 <span className="text-zinc-400 font-normal">(可选)</span></label>
              <input type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className={inputCls} placeholder="用户名" />
            </div>
            <div>
              <label className={labelCls}>密码 <span className="text-zinc-400 font-normal">(可选)</span></label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={inputCls} placeholder="密码" />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
            <div
              role="switch"
              aria-checked={form.is_default}
              tabIndex={0}
              onClick={() => setForm(f => ({ ...f, is_default: !f.is_default }))}
              onKeyDown={e => e.key === 'Enter' && setForm(f => ({ ...f, is_default: !f.is_default }))}
              className={`relative w-9 h-5 rounded-full transition-colors ${form.is_default ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_default ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm text-zinc-700 dark:text-zinc-300">设为默认代理</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            取消
          </button>
          <button onClick={handleSave} disabled={saving || !form.name || !form.host || !form.port} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
