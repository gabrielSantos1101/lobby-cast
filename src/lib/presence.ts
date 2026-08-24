import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import joinSoundUrl from "#/assets/Join.mp3";
import leaveSoundUrl from "#/assets/Leave.mp3";

export const HEARTBEAT_INTERVAL_MS = 10_000;
export const POLL_INTERVAL_MS = 5_000;
const PRESENCE_TTL_MS = 30_000;
const CLEANUP_AFTER_MS = 5 * 60_000;
const CLEANUP_EVERY_N_POLLS = 12;
const VIEWER_ID_STORAGE_KEY = "lobby-cast-viewer-id";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
	| string
	| undefined;

export const presenceEnabled = Boolean(supabaseUrl && supabaseAnonKey);

let cachedClient: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
	if (!presenceEnabled || !supabaseUrl || !supabaseAnonKey) return null;
	cachedClient ??= createClient(supabaseUrl, supabaseAnonKey, {
		auth: { persistSession: false },
	});
	return cachedClient;
}

export function getViewerId(): string {
	try {
		const existing = sessionStorage.getItem(VIEWER_ID_STORAGE_KEY);
		if (existing) return existing;
		const id = crypto.randomUUID();
		sessionStorage.setItem(VIEWER_ID_STORAGE_KEY, id);
		return id;
	} catch {
		return crypto.randomUUID();
	}
}

export async function sendHeartbeat(
	streamId: string,
	viewerId: string,
): Promise<void> {
	const sb = getClient();
	if (!sb) return;
	const { error } = await sb.from("presence").upsert({
		stream_id: streamId,
		viewer_id: viewerId,
		last_seen: Date.now(),
	});
	if (error) {
		console.warn("[presence] heartbeat falhou", error.message);
	}
}

export async function removeHeartbeat(
	streamId: string,
	viewerId: string,
): Promise<void> {
	const sb = getClient();
	if (!sb) return;
	const { error } = await sb
		.from("presence")
		.delete()
		.eq("stream_id", streamId)
		.eq("viewer_id", viewerId);
	if (error) {
		console.warn("[presence] remoção falhou", error.message);
	}
}

export function sendLeaveBeacon(streamId: string, viewerId: string): void {
	if (!supabaseUrl || !supabaseAnonKey) return;
	const params = new URLSearchParams({
		stream_id: `eq.${streamId}`,
		viewer_id: `eq.${viewerId}`,
	});
	void fetch(`${supabaseUrl}/rest/v1/presence?${params.toString()}`, {
		method: "DELETE",
		keepalive: true,
		headers: {
			apikey: supabaseAnonKey,
			Authorization: `Bearer ${supabaseAnonKey}`,
			Prefer: "return=minimal",
		},
	}).catch(() => undefined);
}

async function cleanupStalePresence(): Promise<void> {
	const sb = getClient();
	if (!sb) return;
	const { error } = await sb
		.from("presence")
		.delete()
		.lt("last_seen", Date.now() - CLEANUP_AFTER_MS);
	if (error) {
		console.warn("[presence] cleanup falhou", error.message);
	}
}

let pollCounter = 0;

export async function fetchViewerCount(
	streamId: string,
): Promise<number | null> {
	const sb = getClient();
	if (!sb) return null;
	pollCounter++;
	if (pollCounter % CLEANUP_EVERY_N_POLLS === 0) {
		void cleanupStalePresence();
	}
	const cutoff = Date.now() - PRESENCE_TTL_MS;
	const { count, error } = await sb
		.from("presence")
		.select("*", { count: "exact", head: true })
		.eq("stream_id", streamId)
		.gt("last_seen", cutoff);
	if (error) {
		console.warn("[presence] contagem falhou", error.message);
		return null;
	}
	return count ?? 0;
}

export async function markStreamStarted(streamId: string): Promise<void> {
	const sb = getClient();
	if (!sb) return;
	const { error } = await sb
		.from("streams")
		.upsert(
			{ stream_id: streamId, started_at: Date.now() },
			{ onConflict: "stream_id" },
		);
	if (error) {
		console.warn("[presence] registro de início falhou", error.message);
	}
}

export async function fetchStreamStartedAt(
	streamId: string,
): Promise<number | null> {
	const sb = getClient();
	if (!sb) return null;
	const { data, error } = await sb
		.from("streams")
		.select("started_at")
		.eq("stream_id", streamId)
		.maybeSingle();
	if (error) {
		console.warn("[presence] leitura de início falhou", error.message);
		return null;
	}
	return data?.started_at ?? null;
}

function playSound(url: string): void {
	try {
		const audio = new Audio(url);
		audio.volume = 0.1;
		void audio.play().catch((err) => {
			console.warn("[presence] som falhou", err);
		});
	} catch (err) {
		console.warn("[presence] som falhou", err);
	}
}

export function playJoinSound(): void {
	playSound(joinSoundUrl);
}

export function playLeaveSound(): void {
	playSound(leaveSoundUrl);
}
