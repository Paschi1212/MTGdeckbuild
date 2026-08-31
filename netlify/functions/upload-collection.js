export const handler = async (event) => {
  // TODO: Parse CSV and save to Google Drive

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  }
}
