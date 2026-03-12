import { OAuth2Client } from 'google-auth-library'

export interface GoogleTokenPayload {
  sub: string        // Google user ID
  email: string
  email_verified: boolean
  name?: string
  hd?: string        // Hosted domain (Google Workspace)
}

/**
 * Verify a Google ID token and return the payload, or null if invalid.
 */
export async function verifyGoogleToken(idToken: string): Promise<GoogleTokenPayload | null> {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  if (!GOOGLE_CLIENT_ID) {
    console.error('GOOGLE_CLIENT_ID is not configured')
    return null
  }

  try {
    const client = new OAuth2Client(GOOGLE_CLIENT_ID)
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    })

    const payload = ticket.getPayload()
    if (!payload || !payload.email || !payload.email_verified) {
      return null
    }

    return {
      sub: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified,
      name: payload.name,
      hd: payload.hd,
    }
  } catch (error) {
    console.error('Google token verification failed:', error)
    return null
  }
}
