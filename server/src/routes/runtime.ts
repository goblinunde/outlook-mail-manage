import Router from 'koa-router';
import { RuntimeController } from '../controllers/RuntimeController';

export const runtimeRoutes = new Router();
const ctrl = new RuntimeController();

runtimeRoutes.get('/capabilities', ctrl.capabilities);
