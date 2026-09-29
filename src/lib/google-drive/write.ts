/**
 * Writes a Drive file's `description` field — the one Drive write this app
 * performs. Requires the `drive.metadata` scope (see config.ts); a plain
 * PATCH against files/{fileId} with only the description field in the body,
 * so nothing else about the file (name, content, sharing) is touched.
 */
export async function updateFileDescription(
  accessToken: string,
  fileId: string,
  description: string,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ description }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Drive API error (${res.status}): ${body || res.statusText}`);
  }
}
