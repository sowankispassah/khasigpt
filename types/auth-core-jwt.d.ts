declare module "@auth/core/jwt" {
  type RequestLike = Request | { headers: Headers | Record<string, string> };

  interface GetTokenParamsBase {
    req: RequestLike;
    secret?: string | string[];
    secureCookie?: boolean;
    cookieName?: string;
  }

  export interface GetTokenParams<R extends boolean = false>
    extends GetTokenParamsBase {
    raw?: R;
  }

  export type JWT = Record<string, unknown> & {
    id?: string;
    role?: string;
  };

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

export function getToken<R extends boolean = false>(
  params: GetTokenParams<R>
): Promise<R extends true ? string : JWT | null>;
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
  }
}
