import { createServerFn } from "@tanstack/react-start";

const API_BASE = `https://rtc.live.cloudflare.com/v1/apps/${process.env.CLOUDFLARE_CALLS_APP_ID}`;
const HEADERS = {
	Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
	"Content-Type": "application/json",
};

export const createSession = createServerFn({ method: "POST" }).handler(
	async () => {
		const res = await fetch(`${API_BASE}/sessions/new`, {
			method: "POST",
			headers: HEADERS,
		});
		const data = await res.json();
		return data.sessionId as string;
	},
);

export const pushTracks = createServerFn({ method: "POST" })
	.validator(
		(data: {
			sessionId: string;
			sdp: string;
			tracks: Array<{ location: string; mid: string; trackName: string }>;
		}) => data,
	)
	.handler(async ({ data }) => {
		const res = await fetch(
			`${API_BASE}/sessions/${data.sessionId}/tracks/new`,
			{
				method: "POST",
				headers: HEADERS,
				body: JSON.stringify({
					sessionDescription: { sdp: data.sdp, type: "offer" },
					tracks: data.tracks,
				}),
			},
		);
		return res.json();
	});

export const pullTracks = createServerFn({ method: "POST" })
	.validator(
		(data: {
			sessionId: string;
			tracks: Array<{
				location: string;
				trackName: string;
				sessionId: string;
			}>;
		}) => data,
	)
	.handler(async ({ data }) => {
		const res = await fetch(
			`${API_BASE}/sessions/${data.sessionId}/tracks/new`,
			{
				method: "POST",
				headers: HEADERS,
				body: JSON.stringify({ tracks: data.tracks }),
			},
		);
		return res.json();
	});

export const renegotiate = createServerFn({ method: "POST" })
	.validator((data: { sessionId: string; sdp: string }) => data)
	.handler(async ({ data }) => {
		const res = await fetch(
			`${API_BASE}/sessions/${data.sessionId}/renegotiate`,
			{
				method: "PUT",
				headers: HEADERS,
				body: JSON.stringify({
					sessionDescription: { sdp: data.sdp, type: "answer" },
				}),
			},
		);
		return res.json();
	});
