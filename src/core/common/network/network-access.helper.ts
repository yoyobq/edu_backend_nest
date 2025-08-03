// src/core/common/network/network-access.helper.ts

import * as os from 'os';

/**
 * 判断服务器 IP 是否为指定 IP
 * @param targetIp 目标 IP 地址
 * @returns 是否匹配指定 IP
 */
export function isServerIp(targetIp: string): boolean {
  try {
    const networkInterfaces = os.networkInterfaces();

    return Object.values(networkInterfaces).some((addresses) =>
      addresses?.some((address) => address.family === 'IPv4' && address.address === targetIp),
    );
  } catch {
    return false;
  }
}

/**
 * 判断 IP 是否为私有 IP 地址
 * @param ip IP 地址
 * @returns 是否为私有 IP
 */
export function isPrivateIp(ip: string): boolean {
  // 检查是否为内网 IP 段
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  const [a, b] = parts.map((p) => parseInt(p, 10));

  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/**
 * 从请求头中获取真实客户端 IP 地址
 * 支持 nginx 代理设置的 X-Real-IP 和 X-Forwarded-For 头
 * @param request Express 请求对象或包含 headers 的对象
 * @returns 真实的客户端 IP 地址
 */
export function getRealClientIp(request: {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  connection?: { remoteAddress?: string };
}): string {
  const getCleanIp = (ip: string | undefined): string => ip?.replace(/^::ffff:/, '').trim() || '';

  try {
    // 优先从 X-Real-IP 获取（nginx proxy_set_header X-Real-IP $remote_addr 设置）
    const xRealIp = request.headers['x-real-ip'];
    if (xRealIp) {
      // 考虑到 X-Real-IP 极低可能被不规范中间件修改成数组，取第一个元素
      const ip = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
      return getCleanIp(ip);
    }

    // 从 X-Forwarded-For 获取（nginx proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for 设置）
    // 出于安全考虑，只信任第一跳代理，取第一个 IP 地址
    const xForwardedFor = request.headers['x-forwarded-for'];
    if (xForwardedFor) {
      const firstIp =
        typeof xForwardedFor === 'string'
          ? xForwardedFor.split(',')[0].trim()
          : Array.isArray(xForwardedFor)
            ? xForwardedFor[0].split(',')[0].trim()
            : '';

      if (firstIp) {
        return firstIp;
      }
    }

    // 回退到请求的直接 IP
    if (request.ip) {
      return request.ip;
    }

    // 最后回退到连接的远程地址
    if (request.connection?.remoteAddress) {
      return request.connection.remoteAddress;
    }

    // 如果都获取不到，返回空字符串
    return '';
  } catch {
    return '';
  }
}

/**
 * 检查客户端 IP 是否在允许的 IP 范围内
 * @param clientIp 客户端 IP
 * @param allowedIps 允许的 IP 列表或 IP 段
 * @returns 是否允许访问
 */
export function isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
  try {
    for (const allowedIp of allowedIps) {
      if (matchIpPattern(clientIp, allowedIp)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 匹配 IP 模式（支持通配符和 CIDR）
 * @param ip 要检查的 IP
 * @param pattern IP 模式（如：192.168.1.*, 192.168.1.0/24）
 * @returns 是否匹配
 */
function matchIpPattern(ip: string, pattern: string): boolean {
  // 精确匹配
  if (ip === pattern) {
    return true;
  }

  // 通配符匹配
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '\\d+') + '$');
    return regex.test(ip);
  }

  // CIDR 匹配（简单实现）
  if (pattern.includes('/')) {
    // 这里可以实现更复杂的 CIDR 匹配逻辑
    // 暂时只支持简单的子网匹配
    const [network, prefixLength] = pattern.split('/');
    const prefix = parseInt(prefixLength);

    if (prefix === 24) {
      const networkPrefix = network.substring(0, network.lastIndexOf('.'));
      const ipPrefix = ip.substring(0, ip.lastIndexOf('.'));
      return networkPrefix === ipPrefix;
    }
  }

  return false;
}
