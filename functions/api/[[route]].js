/* Cloudflare Pages で動かす場合の入口。中身は lib/proxy.js と共通。
   Workers で動かす場合はこのファイルは使われない（worker.js が入口）。 */
import { handleApi } from '../../lib/proxy.js';

const seg = params => (Array.isArray(params.route) ? params.route : [params.route].filter(Boolean));

export const onRequestOptions = ({ params }) => handleApi(seg(params), {}, 'OPTIONS');
export const onRequestGet = ({ params, env }) => handleApi(seg(params), env, 'GET');
