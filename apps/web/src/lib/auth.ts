import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'

const API_URL = process.env['API_URL'] ?? 'http://localhost:4000'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        try {
          const res = await fetch(`${API_URL}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          })

          if (!res.ok) return null

          const json = (await res.json()) as {
            success: boolean
            data: { accessToken: string; refreshToken: string }
          }

          if (!json.success) return null

          return {
            id: credentials.email, // placeholder — remplacé par le sub du JWT
            email: credentials.email,
            accessToken: json.data.accessToken,
            refreshToken: json.data.refreshToken,
          }
        } catch {
          return null
        }
      },
    }),

    ...(process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET']
      ? [
          GoogleProvider({
            clientId: process.env['GOOGLE_CLIENT_ID'],
            clientSecret: process.env['GOOGLE_CLIENT_SECRET'],
          }),
        ]
      : []),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // Premier appel après login : user est défini
      if (user) {
        token.accessToken = user.accessToken
        token.refreshToken = user.refreshToken
      }
      return token
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken
      session.refreshToken = token.refreshToken
      if (token.error) session.error = token.error
      return session
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },

  secret: process.env['NEXTAUTH_SECRET'],
}
