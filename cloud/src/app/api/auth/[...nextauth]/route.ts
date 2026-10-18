// next-auth's routes: sign-in, the OAuth callback, sign-out and the session.
import NextAuth from "next-auth";
import { authOptions } from "../../../../auth";

const handler = (request: Request, context: { params: Promise<{ nextauth: string[] }> }): Promise<Response> => NextAuth(authOptions())(request, context);

export { handler as GET, handler as POST };
