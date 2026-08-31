export const handler = async (event) => {
  // TODO: Implement Google OAuth flow

  return {
    statusCode: 302,
    headers: {
      Location: 'https://accounts.google.com/o/oauth2/v2/auth?...'
    },
    body: ''
  }
}
