import {
	Maximize,
	Minimize,
	PictureInPicture2,
	Volume2,
	VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Slider } from "#/components/ui/slider";
import { Toggle } from "#/components/ui/toggle";
import { createSession, pullTracks, renegotiate } from "#/lib/calls";
import { decodeStreamId } from "#/lib/stream-id";

export function StreamPlayer({
	streamId,
	size = "normal",
}: {
	streamId: string;
	size?: "normal" | "mini";
}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [connected, setConnected] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [muted, setMuted] = useState(false);
	const [showVolume, setShowVolume] = useState(false);
	const [volume, setVolume] = useState(1);
	const [isPip, setIsPip] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);
	const [pipSupported] = useState(
		() => typeof document !== "undefined" && document.pictureInPictureEnabled,
	);

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

		async function connect() {
			try {
				setError(null);
				const { tracks } = decodeStreamId(streamId);
				const mySessionId = await createSession();

				const pc = new RTCPeerConnection({
					iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
					bundlePolicy: "max-bundle",
				});
				if (cancelled) {
					pc.close();
					return;
				}
				pcRef.current = pc;

				pc.ontrack = (event) => {
					if (videoRef.current && event.streams[0]) {
						videoRef.current.srcObject = event.streams[0];
					}
				};

				const pullRes = await pullTracks({
					data: {
						sessionId: mySessionId,
						tracks: tracks.map((t) => ({
							location: "remote",
							trackName: t.trackName,
							sessionId: t.sessionId,
						})),
					},
				});

				if (pullRes.requiresImmediateRenegotiation) {
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

				await new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(
						() => reject(new Error("Conexão ICE falhou")),
						10000,
					);
					const check = () => {
						if (pc.iceConnectionState === "connected") {
							clearTimeout(timeout);
							resolve();
						}
					};
					pc.addEventListener("iceconnectionstatechange", check);
				});

				if (!cancelled) setConnected(true);
			} catch (err) {
				if (!cancelled && err instanceof Error) {
					setError(err.message);
				}
			}
		}

		connect();

		return () => {
			cancelled = true;
			pcRef.current?.close();
			pcRef.current = null;
		};
	}, [streamId]);

	return (
		<div
			ref={containerRef}
			className="relative group bg-black rounded-lg overflow-hidden"
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
				className="w-full h-full object-contain"
			/>

			<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
				<div className="relative">
					<Toggle
						pressed={muted}
						onPressedChange={toggleMute}
						size={size === "mini" ? "sm" : "default"}
						className="text-white hover:text-zinc-300 hover:bg-white/10 data-[state=on]:bg-white/10 data-[state=on]:text-white"
						onMouseEnter={() => setShowVolume(true)}
						onMouseLeave={() => setShowVolume(false)}
					>
						{muted ? (
							<VolumeX size={size === "mini" ? 14 : 20} />
						) : (
							<Volume2 size={size === "mini" ? 14 : 20} />
						)}
					</Toggle>

					{showVolume && (
						<div
							className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-900 rounded-lg px-2 py-3"
							onPointerEnter={() => setShowVolume(true)}
							onPointerLeave={() => setShowVolume(false)}
						>
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
								orientation="vertical"
								className="h-20 w-5"
							/>
						</div>
					)}
				</div>

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
