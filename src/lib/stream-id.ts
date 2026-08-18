export function encodeStreamId(
	sessionId: string,
	tracks: Array<{ trackName: string; sessionId: string }>,
): string {
	return btoa(JSON.stringify({ sessionId, tracks }))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

export function decodeStreamId(streamId: string): {
	sessionId: string;
	tracks: Array<{ trackName: string; sessionId: string }>;
} {
	let base64 = streamId.replaceAll("-", "+").replaceAll("_", "/");
	const pad = base64.length % 4;
	if (pad) base64 += "=".repeat(4 - pad);
	return JSON.parse(atob(base64));
}
