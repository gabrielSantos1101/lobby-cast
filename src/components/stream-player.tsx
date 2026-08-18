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
				const broadcasterSessionId = streamId;
				console.log("[StreamPlayer] connecting, broadcasterSessionId:", broadcasterSessionId);
				const mySessionId = await createSession();
				console.log("[StreamPlayer] mySessionId:", mySessionId);

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
					if (!remoteStreams.has(stream.id)) {
						remoteStreams.set(stream.id, stream);
					}
					const combined = new MediaStream();
					for (const s of remoteStreams.values()) {
						for (const track of s.getTracks()) {
							combined.addTrack(track);
						}
					}
					videoRef.current.srcObject = combined;
				};

				let pullRes;
				try {
					console.log("[StreamPlayer] calling pullTracks...");
					pullRes = await pullTracks({
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
					console.log("[StreamPlayer] pullTracks completed, result:", pullRes);
				} catch (e) {
					console.error("[StreamPlayer] pullTracks failed:", e);
					throw e;
				}

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

				let iceConnected = false;

				await new Promise<void>((resolve) => {
					const timeout = setTimeout(() => {
						console.log("[StreamPlayer] ICE timeout, but checking for tracks anyway...");
						resolve();
					}, 10000);
					const check = () => {
						if (pc.iceConnectionState === "connected") {
							iceConnected = true;
							console.log("[StreamPlayer] ICE connected!");
							clearTimeout(timeout);
							resolve();
						}
					};
					pc.addEventListener("iceconnectionstatechange", check);
				});

				console.log("[StreamPlayer] ICE connected:", iceConnected, "proceeding anyway if tracks received");

				if (!cancelled) {
					console.log("[StreamPlayer] connected (tracks received)!");
					setConnected(true);
				}
			} catch (err) {
				console.error("[StreamPlayer] error:", err);
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
