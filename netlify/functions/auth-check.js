export const handler = async (event) => {
  // Check if user has valid session
  const token = event.headers.authorization

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Not authenticated' })
    }
  }

  // TODO: Verify token with Google

  return {
    statusCode: 200,
    body: JSON.stringify({
      user: {
        email: 'user@example.com',
        name: 'User Name'
      }
    })
  }
}
