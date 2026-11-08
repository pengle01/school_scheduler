import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

// Locale prefixing only. Authentication will be added here when the app
// leaves localhost (see ../sms/src/proxy.ts for the pattern).
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
