export function encodeStreamId(
	sessionId: string,
	tracks: Array<{ trackName: string; sessionId: string }>,
): string {
	return btoa(JSON.stringify({ sessionId, tracks }));
}

export function decodeStreamId(streamId: string): {
	sessionId: string;
	tracks: Array<{ trackName: string; sessionId: string }>;
} {
	return JSON.parse(atob(streamId));
}
