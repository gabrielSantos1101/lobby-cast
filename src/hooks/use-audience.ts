import { useEffect, useRef, useState } from "react";
import {
	fetchStreamStartedAt,
	fetchViewerCount,
	getViewerId,
	HEARTBEAT_INTERVAL_MS,
	markStreamStarted,
	POLL_INTERVAL_MS,
	playJoinSound,
	playLeaveSound,
	presenceEnabled,
	removeHeartbeat,
	sendHeartbeat,
	sendLeaveBeacon,
} from "#/lib/presence";

const SOUND_DEBOUNCE_MS = 3_000;

export function formatElapsed(ms: number): string {
	const total = Math.floor(ms / 1000);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	const mm = String(minutes).padStart(2, "0");
	const ss = String(seconds).padStart(2, "0");
	return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function usePresenceHeartbeat(streamId: string | undefined): void {
	useEffect(() => {
		if (!streamId || !presenceEnabled) return;
		const viewerId = getViewerId();
		let cancelled = false;
		const beat = () => {
			if (!cancelled) void sendHeartbeat(streamId, viewerId);
		};
		beat();
		const id = setInterval(beat, HEARTBEAT_INTERVAL_MS);
		const leave = () => sendLeaveBeacon(streamId, viewerId);
		window.addEventListener("pagehide", leave);
		return () => {
			cancelled = true;
			clearInterval(id);
			window.removeEventListener("pagehide", leave);
			void removeHeartbeat(streamId, viewerId);
		};
	}, [streamId]);
}

export function useAudience(streamCode: string | null) {
	const [viewerCount, setViewerCount] = useState<number | null>(null);
	const [elapsedMs, setElapsedMs] = useState(0);
	const lastCountRef = useRef<number | null>(null);
	const lastSoundAtRef = useRef(0);

	useEffect(() => {
		if (!streamCode || !presenceEnabled) {
			setViewerCount(null);
			lastCountRef.current = null;
			return;
		}
		let cancelled = false;
		let firstRead = true;
		void markStreamStarted(streamCode);

		const poll = async () => {
			const next = await fetchViewerCount(streamCode);
			if (cancelled || next === null) return;
			setViewerCount(next);
			const prev = lastCountRef.current;
			lastCountRef.current = next;
			const now = Date.now();
			if (
				!firstRead &&
				prev !== null &&
				next !== prev &&
				now - lastSoundAtRef.current > SOUND_DEBOUNCE_MS
			) {
				lastSoundAtRef.current = now;
				if (next > prev) {
					playJoinSound();
				} else {
					playLeaveSound();
				}
			}
			firstRead = false;
		};

		void poll();
		const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			clearInterval(id);
		};
	}, [streamCode]);

	useEffect(() => {
		if (!streamCode) {
			setElapsedMs(0);
			return;
		}
		const startedAt = Date.now();
		setElapsedMs(0);
		const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
		return () => clearInterval(id);
	}, [streamCode]);

	return { viewerCount, elapsedMs };
}

export function useStreamStatus(streamId: string | undefined) {
	const [viewerCount, setViewerCount] = useState<number | null>(null);
	const [startedAt, setStartedAt] = useState<number | null>(null);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (!streamId || !presenceEnabled) {
			setViewerCount(null);
			setStartedAt(null);
			return;
		}
		let cancelled = false;

		const poll = async () => {
			const count = await fetchViewerCount(streamId);
			if (!cancelled && count !== null) {
				setViewerCount(count);
			}
			const at = await fetchStreamStartedAt(streamId);
			if (!cancelled && at !== null) {
				setStartedAt(at);
			}
		};

		void poll();
		const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
		return () => {
			cancelled = true;
			clearInterval(id);
		};
	}, [streamId]);

	useEffect(() => {
		if (startedAt === null) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [startedAt]);

	const elapsedMs = startedAt !== null ? Math.max(0, now - startedAt) : null;

	return { viewerCount, elapsedMs };
}
