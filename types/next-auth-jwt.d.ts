declare module "next-auth/jwt" {
  type RequestLike = Request | { headers: Headers | Record<string, string> };

  interface GetTokenParams<R extends boolean = false> {
    req: RequestLike;
    secret?: string | string[];
    secureCookie?: boolean;
    cookieName?: string;
    raw?: R;
  }

  export interface JWT extends Record<string, unknown> {
    id?: string;
    role?: string;
  }

  export function getToken<R extends boolean = false>(
    params: GetTokenParams<R>
  ): Promise<R extends true ? string : JWT | null>;

  export function encode(params: {
    token?: JWT;
    secret: string | string[];
    salt: string;
    maxAge?: number;
  }): Promise<string>;

  export function decode(params: {
    token?: string;
    secret: string | string[];
    salt: string;
  }): Promise<JWT | null>;
}
