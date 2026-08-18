import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Draggable } from "#/components/draggable";
import { StreamPlayer } from "#/components/stream-player";
import { createSession, pushTracks } from "#/lib/calls";
import { encodeStreamId } from "#/lib/stream-id";
import { getStreamWidths } from "#/lib/stream-layout";

export const Route = createFileRoute("/share")({ component: Share });

function Share() {
	const navigate = useNavigate();
	const [streamCode, setStreamCode] = useState<string | null>(null);
	const [sharing, setSharing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [muted, setMuted] = useState(false);
	const [volume, setVolume] = useState(1);
	const [audioEnabled, setAudioEnabled] = useState(true);
	const videoRef = useRef<HTMLVideoElement>(null);
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const transceiversRef = useRef<RTCRtpTransceiver[] | null>(null);

	const [watchIds, setWatchIds] = useState<string[]>([]);
	const [newCode, setNewCode] = useState("");
	const [resolution, setResolution] = useState<"720" | "1080">("1080");
	const [fps, setFps] = useState(30);

	const watchingOthers = watchIds.length > 0;

	const syncVideoRef = useCallback((node: HTMLVideoElement | null) => {
		(videoRef as React.MutableRefObject<HTMLVideoElement | null>).current =
			node;
		if (node && streamRef.current) {
			node.srcObject = streamRef.current;
		}
	}, []);

	const addWatch = useCallback(() => {
		const code = newCode.trim();
		if (code && !watchIds.includes(code)) {
			setWatchIds((prev) => [...prev, code]);
			setNewCode("");
		}
	}, [newCode, watchIds]);

	const toggleMute = useCallback(() => {
		const stream = streamRef.current;
		if (!stream) return;
		const newMuted = !muted;
		stream.getAudioTracks().forEach((t) => {
			t.enabled = !newMuted;
		});
		setMuted(newMuted);
	}, [muted]);

	const toggleAudio = useCallback(() => {
		const stream = streamRef.current;
		const transceivers = transceiversRef.current;
		const pc = pcRef.current;
		if (!stream || !transceivers || !pc) return;

		const newEnabled = !audioEnabled;

		if (newEnabled) {
			stream.getAudioTracks().forEach((track) => {
				track.enabled = true;
			});
			const audioTrack = stream.getAudioTracks()[0];
			if (audioTrack) {
				const audioTransceiver = transceivers.find(
					(t) => t.sender.track?.kind === "audio",
				);
				if (audioTransceiver) {
					audioTransceiver.sender.replaceTrack(audioTrack);
				}
			}
		} else {
			const silentTrack = new MediaStreamTrack({
				kind: "audio",
				...new AudioContext().createMediaStreamDestination().stream.getAudioTracks()[0]
					.getSettings(),
			});
			const audioTransceiver = transceivers.find(
				(t) => t.sender.track?.kind === "audio",
			);
			if (audioTransceiver) {
				audioTransceiver.sender.replaceTrack(silentTrack);
			}
			stream.getAudioTracks().forEach((track) => {
				track.enabled = false;
			});
		}

		setAudioEnabled(newEnabled);
	}, [audioEnabled]);

	const stopSharing = useCallback(() => {
		pcRef.current?.close();
		streamRef.current?.getTracks().forEach((t) => {
			t.stop();
		});
		pcRef.current = null;
		streamRef.current = null;
		transceiversRef.current = null;
		setSharing(false);
		setStreamCode(null);
		setMuted(false);
		setAudioEnabled(true);
		setWatchIds([]);
	}, []);

	const changeStream = useCallback(async () => {
		try {
			setError(null);
			const pc = pcRef.current;
			const oldStream = streamRef.current;
			const transceivers = transceiversRef.current;
			if (!pc || !oldStream || !transceivers) return;

			const newScreen = await navigator.mediaDevices.getDisplayMedia({
				video: {
					width: { ideal: Number(resolution) === 720 ? 1280 : 1920 },
					height: { ideal: Number(resolution) },
					frameRate: { ideal: fps },
				},
				audio: true,
			});

			const newVideo = newScreen.getVideoTracks()[0];
			const newAudio = newScreen.getAudioTracks()[0];

			const videoTransceiver = transceivers.find(
				(t) => t.sender.track?.kind === "video",
			);
			if (videoTransceiver && newVideo) {
				await videoTransceiver.sender.replaceTrack(newVideo);
			}

			const audioTransceiver = transceivers.find(
				(t) => t.sender.track?.kind === "audio",
			);
			if (audioTransceiver && newAudio && audioEnabled) {
				await audioTransceiver.sender.replaceTrack(newAudio);
			}

			oldStream.getTracks().forEach((t) => t.stop());

			const combined = new MediaStream([
				...(newVideo ? [newVideo] : []),
				...(newAudio ? [newAudio] : []),
			]);
			streamRef.current = combined;

			if (videoRef.current) {
				videoRef.current.srcObject = combined;
			}

			combined.getTracks().forEach((track) => {
				track.addEventListener("ended", () => stopSharing());
			});
		} catch (err) {
			if (err instanceof Error && err.name !== "AbortError") {
				setError(err.message);
			}
		}
	}, [resolution, fps, audioEnabled, stopSharing]);

	const startSharing = useCallback(async () => {
		try {
			setError(null);

			const screen = await navigator.mediaDevices.getDisplayMedia({
				video: {
					width: { ideal: Number(resolution) === 720 ? 1280 : 1920 },
					height: { ideal: Number(resolution) },
					frameRate: { ideal: fps },
				},
				audio: true,
			});
			streamRef.current = screen;

			screen.getTracks().forEach((track) => {
				track.addEventListener("ended", () => stopSharing());
			});

			const sessionId = await createSession();

			const pc = new RTCPeerConnection({
				iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
				bundlePolicy: "max-bundle",
			});
			pcRef.current = pc;

			const transceivers = screen
				.getTracks()
				.map((track) => pc.addTransceiver(track, { direction: "sendonly" }));
			transceiversRef.current = transceivers;

			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);

			const pushRes = await pushTracks({
				data: {
					sessionId,
					sdp: offer.sdp ?? "",
					tracks: transceivers.map(({ mid, sender }) => ({
						location: "local",
						mid: mid ?? "",
						trackName: sender.track?.id ?? "",
					})),
				},
			});

			await pc.setRemoteDescription(
				new RTCSessionDescription(pushRes.sessionDescription),
			);

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

			const streamId = encodeStreamId(sessionId, [
				...transceivers.map(({ sender }) => ({
					trackName: sender.track?.id ?? "",
					sessionId,
				})),
			]);

			setStreamCode(streamId);
			setSharing(true);
		} catch (err) {
			if (err instanceof Error && err.name !== "AbortError") {
				setError(err.message);
			}
		}
	}, [stopSharing, resolution, fps]);

	if (!sharing) {
		return (
			<div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
				<div className="w-full max-w-sm space-y-6">
					<h1 className="text-2xl font-bold text-center">Lobby Cast</h1>

					{error && <p className="text-red-400 text-sm text-center">{error}</p>}

					<div className="flex gap-3">
						<div className="flex-1 space-y-1">
							<label htmlFor="resolution" className="text-xs text-zinc-500">
								Resolução
							</label>
							<select
								id="resolution"
								value={resolution}
								onChange={(e) =>
									setResolution(e.target.value as "720" | "1080")
								}
								className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 cursor-pointer"
							>
								<option value="720">720p</option>
								<option value="1080">1080p</option>
							</select>
						</div>
						<div className="flex-1 space-y-1">
							<label htmlFor="fps" className="text-xs text-zinc-500">
								FPS
							</label>
							<select
								id="fps"
								value={fps}
								onChange={(e) => setFps(Number(e.target.value))}
								className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 cursor-pointer"
							>
								<option value={5}>5</option>
								<option value={15}>15</option>
								<option value={24}>24</option>
								<option value={30}>30</option>
								<option value={60}>60</option>
							</select>
						</div>
					</div>

					<button
						type="button"
						onClick={startSharing}
						className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors cursor-pointer"
					>
						Iniciar transmissão
					</button>

					<div className="relative">
						<div className="absolute inset-0 flex items-center">
							<div className="w-full border-t border-zinc-700" />
						</div>
						<div className="relative flex justify-center text-xs">
							<span className="bg-zinc-950 px-2 text-zinc-500">ou</span>
						</div>
					</div>

					<div className="space-y-2">
						<input
							type="text"
							value={newCode}
							onChange={(e) => setNewCode(e.target.value)}
							placeholder="Cole o link ou código da live"
							className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
						/>
						<button
							type="button"
							onClick={() => {
								const code = newCode.trim();
								if (code) {
									navigate({
										to: "/watch/$streamId",
										params: { streamId: code },
									});
								}
							}}
							disabled={!newCode.trim()}
							className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors cursor-pointer"
						>
							Assistir
						</button>
					</div>
				</div>
			</div>
		);
	}

	const watchWidths = getStreamWidths(watchIds.length);
	const watchJustify = watchIds.length === 3 ? "justify-center" : "";

	return (
		<div className="min-h-screen bg-zinc-950 text-white flex flex-col">
			<div className="flex-1 flex items-center justify-center p-4">
				{watchIds.length === 0 ? (
					<div className="w-full max-w-4xl space-y-4">
						<video
							ref={syncVideoRef}
							autoPlay
							muted
							playsInline
							className="w-full rounded-lg bg-black aspect-video object-contain"
						/>

						<div className="space-y-3">
							<div className="flex items-center gap-3">
								<button
									type="button"
									onClick={toggleMute}
									className={`px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
										muted
											? "bg-zinc-700 hover:bg-zinc-600"
											: "bg-zinc-800 hover:bg-zinc-700"
									}`}
								>
									{muted ? "Desmutar" : "Mutar"}
								</button>
								<input
									type="range"
									min="0"
									max="1"
									step="0.05"
									value={volume}
									onChange={(e) => {
										const v = Number.parseFloat(e.target.value);
										setVolume(v);
										if (videoRef.current) videoRef.current.volume = v;
									}}
									className="flex-1 h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow-md"
								/>
							</div>

							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={changeStream}
									className="px-4 py-2 rounded-lg text-sm bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
								>
									Aplicar {resolution}p / {fps}fps
								</button>

								<div className="flex-1" />

								<button
									type="button"
									onClick={toggleAudio}
									className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
										audioEnabled
											? "bg-zinc-800 hover:bg-zinc-700"
											: "bg-red-900/50 hover:bg-red-900/70"
									}`}
								>
									{audioEnabled ? (
										<>
											<Mic size={16} />
											Áudio
										</>
									) : (
										<>
											<MicOff size={16} />
											Sem áudio
										</>
									)}
								</button>
							</div>

							{streamCode && (
								<div className="space-y-2">
									<p className="text-sm text-zinc-400 text-center">
										Compartilhe sua live:
									</p>
									<div className="flex gap-2">
										<input
											readOnly
											value={`${window.location.origin}/watch/${streamCode}`}
											className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono truncate"
										/>
										<button
											type="button"
											onClick={() => navigator.clipboard.writeText(streamCode)}
											className="bg-zinc-800 hover:bg-zinc-700 px-4 py-3 rounded-lg text-sm transition-colors cursor-pointer"
										>
											Copiar código
										</button>
										<button
											type="button"
											onClick={() =>
												navigator.clipboard.writeText(
													`${window.location.origin}/watch/${streamCode}`,
												)
											}
											className="bg-zinc-800 hover:bg-zinc-700 px-4 py-3 rounded-lg text-sm transition-colors cursor-pointer"
										>
											Copiar link
										</button>
									</div>
								</div>
							)}
						</div>
					</div>
				) : (
					<div
						className={`flex flex-wrap gap-3 w-full max-w-6xl ${watchJustify}`}
					>
						{watchIds.map((id, i) => (
							<div key={id} className={`${watchWidths[i]} min-h-[300px]`}>
								<StreamPlayer streamId={id} />
							</div>
						))}
					</div>
				)}
			</div>

			<div className="flex gap-2 p-4 border-t border-zinc-800">
				<input
					type="text"
					value={newCode}
					onChange={(e) => setNewCode(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") addWatch();
					}}
					placeholder="Adicionar outra live"
					className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
				/>
				<button
					type="button"
					onClick={addWatch}
					disabled={!newCode.trim()}
					className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer"
				>
					Adicionar
				</button>

				<button
					type="button"
					onClick={() => navigate({ to: "/" })}
					className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer"
				>
					Voltar
				</button>

				<button
					type="button"
					onClick={stopSharing}
					className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
				>
					Parar transmissão
				</button>
			</div>

			{watchingOthers && (
				<Draggable initialX={16} initialY={80}>
					<div className="w-64 rounded-lg overflow-hidden shadow-2xl border border-zinc-700">
						<video
							ref={syncVideoRef}
							autoPlay
							muted
							playsInline
							className="w-full aspect-video object-contain bg-black"
						/>
						<div className="bg-zinc-900 p-2 flex items-center gap-2">
							<button
								type="button"
								onClick={toggleMute}
								className="text-white hover:text-zinc-300 transition-colors cursor-pointer"
							>
								{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
							</button>
							<input
								type="range"
								min="0"
								max="1"
								step="0.05"
								value={volume}
								onChange={(e) => {
									const v = Number.parseFloat(e.target.value);
									setVolume(v);
									if (videoRef.current) videoRef.current.volume = v;
								}}
								className="flex-1 h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow-md"
							/>
							<span className="text-xs text-zinc-500 w-12 truncate">
								Ao vivo
							</span>
						</div>
					</div>
				</Draggable>
			)}
		</div>
	);
}
