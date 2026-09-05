import { request } from 'node:https';
export const send = body => request('/x', body);
