declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ADMIN_EMAILS?: string;
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    APPMAX_CLIENT_ID?: string;
    APPMAX_CLIENT_SECRET?: string;
    APPMAX_ENVIRONMENT?: string;
    APPMAX_EXTERNAL_ID?: string;
    SITE_URL?: string;
  }
}
