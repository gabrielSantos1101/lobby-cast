import {
	Eye,
	Maximize,
	Minimize,
	PictureInPicture2,
	Volume2,
	VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Slider } from "#/components/ui/slider";
import { Toggle } from "#/components/ui/toggle";
import { ZoomMinimap } from "#/components/zoom-minimap";
import {
	formatElapsed,
	usePresenceHeartbeat,
	useStreamStatus,
} from "#/hooks/use-audience";
import { useZoomPan } from "#/hooks/use-zoom-pan";
import { createSession, pullTracks, renegotiate } from "#/lib/calls";

export function StreamPlayer({
	streamId,
	selfStreamId,
	size = "normal",
}: {
	streamId: string;
	selfStreamId?: string;
	size?: "normal" | "mini";
}) {
	usePresenceHeartbeat(streamId === selfStreamId ? undefined : streamId);
	const status = useStreamStatus(streamId);
	const videoRef = useRef<HTMLVideoElement>(null);
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [connected, setConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [muted, setMuted] = useState(true);
	const [volume, setVolume] = useState(1);
	const [isPip, setIsPip] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);
	const [pipSupported] = useState(
		() => typeof document !== "undefined" && document.pictureInPictureEnabled,
	);
	const zoom = useZoomPan();

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		const onEnter = () => setIsPip(true);
		const onLeave = () => setIsPip(false);
		video.addEventListener("enterpictureinpicture", onEnter);
		video.addEventListener("leavepictureinpicture", onLeave);
		return () => {
			video.removeEventListener("enterpictureinpicture", onEnter);
			video.removeEventListener("leavepictureinpicture", onLeave);
		};
	}, []);

	const toggleMute = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;
		video.muted = !video.muted;
		setMuted(!muted);
	}, [muted]);

	const togglePip = useCallback(async () => {
		const video = videoRef.current;
		if (!video) return;
		if (document.pictureInPictureElement) {
			await document.exitPictureInPicture();
		} else {
			await video.requestPictureInPicture();
		}
	}, []);

	const toggleFullscreen = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		if (document.fullscreenElement) {
			document.exitFullscreen();
			setFullscreen(false);
		} else {
			el.requestFullscreen();
			setFullscreen(true);
		}
	}, []);

	useEffect(() => {
		const onFsChange = () => setFullscreen(!!document.fullscreenElement);
		document.addEventListener("fullscreenchange", onFsChange);
		return () => document.removeEventListener("fullscreenchange", onFsChange);
	}, []);

	useEffect(() => {
		let cancelled = false;
		let checkTracks: ReturnType<typeof setInterval> | null = null;

		async function connect() {
			try {
				setError(null);
				const broadcasterSessionId = streamId;
				const mySessionId = await createSession();

				const pc = new RTCPeerConnection({
					iceServers: [
						{ urls: "stun:stun.cloudflare.com:3478" },
						{ urls: "stun:stun.l.google.com:19302" },
						{
							urls: "turn:openrelay.metered.ca:80",
							username: "openrelayproject",
							credential: "openrelayproject",
						},
					],
					bundlePolicy: "max-bundle",
				});
				if (cancelled) {
					pc.close();
					return;
				}
				pcRef.current = pc;

				const remoteStreams = new Map<string, MediaStream>();

				pc.ontrack = (event) => {
					if (!videoRef.current) return;
					const stream = event.streams[0];
					if (!stream) return;

					stream.onremovetrack = () => {
						console.log("[StreamPlayer] track removed from stream");
					};

					if (!remoteStreams.has(stream.id)) {
						remoteStreams.set(stream.id, stream);
					}
					const combined = new MediaStream();
					for (const s of remoteStreams.values()) {
						for (const track of s.getTracks()) {
							if (track.readyState === "ended") {
								console.log("[StreamPlayer] track ended, showing message");
								setError("Transmissão encerrada");
								return;
							}
							combined.addTrack(track);
						}
					}
					videoRef.current.srcObject = combined;
				};

				const pullRes = await pullTracks({
					data: {
						sessionId: mySessionId,
						tracks: [
							{
								location: "remote",
								trackName: "video",
								sessionId: broadcasterSessionId,
							},
							{
								location: "remote",
								trackName: "audio",
								sessionId: broadcasterSessionId,
							},
						],
					},
				});

				if (pullRes.errorCode) {
					throw new Error(pullRes.errorDescription ?? "Falha ao puxar tracks");
				}

				if (pullRes.sessionDescription) {
					await pc.setRemoteDescription(
						new RTCSessionDescription(pullRes.sessionDescription),
					);
					const answer = await pc.createAnswer();
					await pc.setLocalDescription(answer);

					const renRes = await renegotiate({
						data: { sessionId: mySessionId, sdp: answer.sdp ?? "" },
					});
					if (renRes.errorCode) {
						throw new Error(renRes.errorDescription);
					}
				}

				await new Promise<void>((resolve) => {
					const timeout = setTimeout(() => {
						resolve();
					}, 20000);
					const check = () => {
						if (pc.iceConnectionState === "connected") {
							clearTimeout(timeout);
							resolve();
						} else if (
							pc.iceConnectionState === "disconnected" ||
							pc.iceConnectionState === "failed" ||
							pc.iceConnectionState === "closed"
						) {
							clearTimeout(timeout);
							setError("Transmissão encerrada");
							resolve();
						}
					};
					pc.addEventListener("iceconnectionstatechange", check);
				});

				if (!cancelled) {
					setConnected(true);
				}

				const trackChecker = setInterval(() => {
					for (const stream of remoteStreams.values()) {
						for (const track of stream.getTracks()) {
							if (track.readyState === "ended") {
								clearInterval(trackChecker);
								setError("Transmissão encerrada");
								return;
							}
						}
					}
				}, 2000);
				checkTracks = trackChecker;
			} catch (err) {
				if (!cancelled && err instanceof Error) {
					setError(err.message);
				}
			}
		}

		connect();

		return () => {
			cancelled = true;
			if (checkTracks) clearInterval(checkTracks);
			pcRef.current?.close();
			pcRef.current = null;
		};
	}, [streamId]);

	return (
		<div
			ref={containerRef}
			data-zoom-container
			onWheel={zoom.onWheel}
			onPointerDown={zoom.onPointerDown}
			onPointerMove={zoom.onPointerMove}
			onPointerUp={zoom.onPointerUp}
			className={`relative group bg-black rounded-lg overflow-hidden w-full h-full flex items-center justify-center ${zoom.scale > 1 ? "cursor-grab" : ""}`}
		>
			{error && (
				<div className="absolute inset-0 flex items-center justify-center">
					<p className="text-red-400 text-sm">{error}</p>
				</div>
			)}

			{!connected && !error && (
				<div className="absolute inset-0 flex items-center justify-center">
					<p className="text-zinc-500 text-sm">Conectando...</p>
				</div>
			)}

			<video
				ref={videoRef}
				autoPlay
				playsInline
				muted
				className="w-full h-full object-contain"
				style={{
					transform: `scale(${zoom.scale}) translate(${zoom.translate.x}%, ${zoom.translate.y}%)`,
					transition: "none",
				}}
			/>

			{connected &&
				(status.elapsedMs !== null || status.viewerCount !== null) && (
					<div className="pointer-events-none absolute top-2 left-2 z-10 flex items-center gap-2.5 rounded-full bg-black/60 border border-white/10 px-2.5 py-1">
						{status.elapsedMs !== null && (
							<span className="flex items-center gap-1.5 text-xs text-white">
								<span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
								{formatElapsed(status.elapsedMs)}
							</span>
						)}
						{status.viewerCount !== null && (
							<span className="flex items-center gap-1 text-xs text-zinc-300">
								<Eye size={12} className="text-emerald-400" />
								{status.viewerCount}
							</span>
						)}
					</div>
				)}

			<ZoomMinimap
				scale={zoom.scale}
				translateX={zoom.translate.x}
				translateY={zoom.translate.y}
				onPanChange={zoom.setPanFromMinimap}
				onReset={zoom.reset}
			/>

			<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
				<Toggle
					pressed={muted}
					onPressedChange={toggleMute}
					size={size === "mini" ? "sm" : "default"}
					className="text-white hover:text-zinc-300 hover:bg-white/10 data-[state=on]:bg-white/10 data-[state=on]:text-white"
				>
					{muted ? (
						<VolumeX size={size === "mini" ? 14 : 20} />
					) : (
						<Volume2 size={size === "mini" ? 14 : 20} />
					)}
				</Toggle>

				<Slider
					min={0}
					max={1}
					step={0.05}
					value={[volume]}
					onValueChange={(v) => {
						const val = Array.isArray(v) ? v[0] : v;
						setVolume(val);
						if (videoRef.current) videoRef.current.volume = val;
					}}
					className="w-24"
				/>

				<div className="flex-1" />

				{size !== "mini" && (
					<>
						{pipSupported && (
							<button
								type="button"
								onClick={togglePip}
								className={`text-white hover:text-zinc-300 transition-colors cursor-pointer ${isPip ? "text-blue-400" : ""}`}
							>
								<PictureInPicture2 size={20} />
							</button>
						)}

						<button
							type="button"
							onClick={toggleFullscreen}
							className="text-white hover:text-zinc-300 transition-colors cursor-pointer"
						>
							{fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
						</button>
					</>
				)}
			</div>
		</div>
	);
}
