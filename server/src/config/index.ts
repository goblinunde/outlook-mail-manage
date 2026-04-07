import dotenv from 'dotenv';
import path from 'path';
import { resolveRuntimeConfig } from './runtime';

// 尝试加载根目录和 server 目录的 .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const runtimeConfig = resolveRuntimeConfig({
  runtime: 'node',
  env: process.env,
});

export const config = {
  ...runtimeConfig,
  dbPath: path.resolve(__dirname, '../..', runtimeConfig.db.path),
};
