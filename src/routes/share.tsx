import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	AlertTriangle,
	Camera,
	Eye,
	Mic,
	MicOff,
	Monitor,
	Volume2,
	VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Draggable } from "#/components/draggable";
import { StreamPlayer } from "#/components/stream-player";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Slider } from "#/components/ui/slider";
import { Toggle } from "#/components/ui/toggle";
import { formatElapsed, useAudience } from "#/hooks/use-audience";
import { createSession, pushTracks } from "#/lib/calls";
import { getStreamWidths } from "#/lib/stream-layout";

export const Route = createFileRoute("/share")({ component: Share });

function extractStreamId(input: string): string {
  const trimmed = input.trim();
  const watchPrefix = "/watch/";
  if (trimmed.includes(watchPrefix)) {
    const idx = trimmed.indexOf(watchPrefix);
    return trimmed.slice(idx + watchPrefix.length).split(/[?#]/)[0] ?? "";
  }
  return trimmed;
}

function getDisplayMediaOptions(resolution: "720" | "1080", fps: number) {
  return {
    video: {
      width: { ideal: Number(resolution) === 720 ? 1280 : 1920 },
      height: { ideal: Number(resolution) },
      frameRate: { ideal: fps },
    },
    audio: true,
    systemAudio: "include",
    windowAudio: "system",
  } satisfies DisplayMediaStreamOptions & {
    systemAudio: "include";
    windowAudio: "system";
  };
}

function logCaptureTracks(label: string, stream: MediaStream) {
  console.info(`[Share] ${label}`, {
    userAgent: navigator.userAgent,
    videoTracks: stream.getVideoTracks().map((track) => ({
      label: track.label,
      readyState: track.readyState,
      settings: track.getSettings(),
    })),
    audioTracks: stream.getAudioTracks().map((track) => ({
      label: track.label,
      readyState: track.readyState,
      settings: track.getSettings(),
    })),
  });
}
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
	const audioMixRef = useRef<{
		ctx: AudioContext;
		dest: MediaStreamAudioDestinationNode;
		sysSource: MediaStreamAudioSourceNode | null;
		micSource: MediaStreamAudioSourceNode | null;
		sysTrack: MediaStreamTrack | null;
		sysConnected: boolean;
		micConnected: boolean;
	} | null>(null);
	const micStreamRef = useRef<MediaStream | null>(null);
	const audioEnabledRef = useRef(true);
	const micActiveRef = useRef(false);

	const [watchIds, setWatchIds] = useState<string[]>([]);
	const [newCode, setNewCode] = useState("");
	const [resolution, setResolution] = useState<"720" | "1080">("1080");
	const [fps, setFps] = useState(24);
	const [audioWarning, setAudioWarning] = useState(false);
	const [webcamMode, setWebcamMode] = useState(false);
	const [micEnabled, setMicEnabled] = useState(false);

	const watchingOthers = watchIds.length > 0;
	const { viewerCount, elapsedMs } = useAudience(sharing ? streamCode : null);

	const syncVideoRef = useCallback((node: HTMLVideoElement | null) => {
		(videoRef as React.MutableRefObject<HTMLVideoElement | null>).current =
			node;
		if (node && streamRef.current) {
			node.srcObject = streamRef.current;
		}
	}, []);

	const addWatch = useCallback(() => {
		const code = extractStreamId(newCode);
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

	const ensureAudioMix = useCallback((sysTrack: MediaStreamTrack | null) => {
		let mix = audioMixRef.current;
		if (!mix) {
			const ctx = new AudioContext();
			const dest = ctx.createMediaStreamDestination();
			mix = {
				ctx,
				dest,
				sysSource: null,
				micSource: null,
				sysTrack: null,
				sysConnected: false,
				micConnected: false,
			};
			audioMixRef.current = mix;
		}
		if (mix.sysTrack !== sysTrack) {
			if (mix.sysSource) mix.sysSource.disconnect();
			mix.sysSource = sysTrack
				? mix.ctx.createMediaStreamSource(new MediaStream([sysTrack]))
				: null;
			if (mix.sysTrack) mix.sysTrack.stop();
			mix.sysTrack = sysTrack;
			mix.sysConnected = false;
		}
		if (mix.ctx.state === "suspended") {
			void mix.ctx.resume().catch(() => {});
		}
		return mix.dest.stream.getAudioTracks()[0];
	}, []);

	const syncAudioConnections = useCallback(() => {
		const mix = audioMixRef.current;
		if (!mix) return;
		const sysOn = audioEnabledRef.current && mix.sysSource !== null;
		const micOn =
			micActiveRef.current && mix.micSource !== null && audioEnabledRef.current;

		if (mix.sysSource) {
			if (sysOn && !mix.sysConnected) {
				mix.sysSource.connect(mix.dest);
				mix.sysConnected = true;
			} else if (!sysOn && mix.sysConnected) {
				mix.sysSource.disconnect();
				mix.sysConnected = false;
			}
		}
		if (mix.micSource) {
			if (micOn && !mix.micConnected) {
				mix.micSource.connect(mix.dest);
				mix.micConnected = true;
			} else if (!micOn && mix.micConnected) {
				mix.micSource.disconnect();
				mix.micConnected = false;
			}
		}
	}, []);

	const toggleAudio = useCallback(() => {
		const newEnabled = !audioEnabled;
		audioEnabledRef.current = newEnabled;
		syncAudioConnections();
		setAudioEnabled(newEnabled);
	}, [audioEnabled, syncAudioConnections]);

	const toggleMic = useCallback(async () => {
		const newEnabled = !micEnabled;
		const mix = audioMixRef.current;
		if (newEnabled) {
			if (!mix || !audioEnabledRef.current) return;
			if (!micStreamRef.current) {
				micStreamRef.current = await navigator.mediaDevices.getUserMedia({
					video: false,
					audio: true,
				});
			}
			if (!mix.micSource) {
				mix.micSource = mix.ctx.createMediaStreamSource(micStreamRef.current);
			}
			micActiveRef.current = true;
			syncAudioConnections();
			setMicEnabled(true);
		} else {
			micActiveRef.current = false;
			syncAudioConnections();
			if (mix?.micSource) {
				mix.micSource.disconnect();
				mix.micSource = null;
				mix.micConnected = false;
			}
			micStreamRef.current?.getTracks().forEach((t) => t.stop());
			micStreamRef.current = null;
			setMicEnabled(false);
		}
	}, [micEnabled, syncAudioConnections]);

	const stopSharing = useCallback(() => {
		pcRef.current?.close();
		streamRef.current?.getTracks().forEach((t) => {
			t.stop();
		});
		const mix = audioMixRef.current;
		if (mix) {
			mix.sysSource?.disconnect();
			mix.micSource?.disconnect();
			mix.sysTrack?.stop();
			mix.ctx.close();
		}
		micStreamRef.current?.getTracks().forEach((t) => t.stop());
		pcRef.current = null;
		streamRef.current = null;
		transceiversRef.current = null;
		audioMixRef.current = null;
		micStreamRef.current = null;
		audioEnabledRef.current = true;
		micActiveRef.current = false;
		setSharing(false);
		setStreamCode(null);
		setMuted(false);
		setAudioEnabled(true);
		setAudioWarning(false);
		setWebcamMode(false);
		setMicEnabled(false);
		setWatchIds([]);
	}, []);

	const applyResolution = useCallback(async () => {
		const stream = streamRef.current;
		if (!stream) return;

		const videoTrack = stream.getVideoTracks()[0];
		if (videoTrack) {
			await videoTrack.applyConstraints({
				width: { ideal: Number(resolution) === 720 ? 1280 : 1920 },
				height: { ideal: Number(resolution) },
				frameRate: { ideal: fps },
			});
		}
	}, [resolution, fps]);

	const changeScreen = useCallback(async () => {
		try {
			setError(null);
			const pc = pcRef.current;
			const oldStream = streamRef.current;
			const transceivers = transceiversRef.current;
			if (!pc || !oldStream || !transceivers) return;

			const newScreen = await navigator.mediaDevices.getDisplayMedia(getDisplayMediaOptions(resolution, fps));

			logCaptureTracks("screen changed", newScreen);
			setAudioWarning(newScreen.getAudioTracks().length === 0);

			const newVideo = newScreen.getVideoTracks()[0];
			const newAudio = newScreen.getAudioTracks()[0];

			const mixedTrack = ensureAudioMix(newAudio ?? null);
			syncAudioConnections();

			const videoTransceiver = transceivers.find(
				(t) => t.sender.track?.kind === "video",
			);
			if (videoTransceiver && newVideo) {
				await videoTransceiver.sender.replaceTrack(newVideo);
			}

			const audioTransceiver = transceivers.find(
				(t) => t.sender.track?.kind === "audio",
			);
			if (audioTransceiver && mixedTrack) {
				await audioTransceiver.sender.replaceTrack(mixedTrack);
			}

			for (const t of oldStream.getVideoTracks()) t.stop();

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

			setWebcamMode(false);
		} catch (err) {
			if (err instanceof Error && err.name !== "AbortError") {
				setError(err.message);
			}
		}
	}, [resolution, fps, stopSharing, ensureAudioMix, syncAudioConnections]);

	const toggleWebcam = useCallback(async () => {
		try {
			setError(null);
			const pc = pcRef.current;
			const oldStream = streamRef.current;
			const transceivers = transceiversRef.current;
			if (!pc || !oldStream || !transceivers) return;

			const showWebcam = !webcamMode;

			const newStream = showWebcam
				? await navigator.mediaDevices.getUserMedia({
						video: {
							width: { ideal: Number(resolution) === 720 ? 1280 : 1920 },
							height: { ideal: Number(resolution) },
							frameRate: { ideal: fps },
						},
						audio: false,
					})
				: await navigator.mediaDevices.getDisplayMedia(getDisplayMediaOptions(resolution, fps));

			logCaptureTracks(showWebcam ? "webcam selected" : "screen restored", newStream);
			setAudioWarning(!showWebcam && newStream.getAudioTracks().length === 0);

			const newVideo = newStream.getVideoTracks()[0];
			const newAudio = showWebcam
				? oldStream.getAudioTracks()[0]
				: newStream.getAudioTracks()[0];
			const mixedTrack = showWebcam ? null : ensureAudioMix(newAudio ?? null);
			syncAudioConnections();

			const videoTransceiver = transceivers.find(
				(t) => t.sender.track?.kind === "video",
			);
			if (videoTransceiver && newVideo) {
				await videoTransceiver.sender.replaceTrack(newVideo);
			}

			const audioTransceiver = transceivers.find(
				(t) => t.sender.track?.kind === "audio",
			);
			if (audioTransceiver && mixedTrack) {
				await audioTransceiver.sender.replaceTrack(mixedTrack);
			}

			for (const t of oldStream.getVideoTracks()) t.stop();

			const combined = new MediaStream([
				...(newVideo ? [newVideo] : []),
				...(newAudio ? [newAudio] : []),
			]);
			streamRef.current = combined;

			if (videoRef.current) {
				videoRef.current.srcObject = combined;
			}

			combined.getVideoTracks().forEach((track) => {
				track.addEventListener("ended", () => stopSharing());
			});

			setWebcamMode(showWebcam);
		} catch (err) {
			if (err instanceof Error && err.name !== "AbortError") {
				setError(err.message);
			}
		}
	}, [webcamMode, resolution, fps, stopSharing, ensureAudioMix, syncAudioConnections]);

	const startSharing = useCallback(async () => {
		try {
			setError(null);

			const screen = await navigator.mediaDevices.getDisplayMedia(getDisplayMediaOptions(resolution, fps));
			streamRef.current = screen;
      logCaptureTracks("screen selected", screen);			setAudioWarning(screen.getAudioTracks().length === 0);

			screen.getTracks().forEach((track) => {
				track.addEventListener("ended", () => stopSharing());
			});

			const sessionId = await createSession();

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
			pcRef.current = pc;

			const screenAudio = screen.getAudioTracks()[0];
			const mixedTrack = ensureAudioMix(screenAudio ?? null);
			console.info("[Share] publishing audio mix", {
				hasSystemAudio: Boolean(screenAudio),
				mixedTrackReadyState: mixedTrack.readyState,
			});
			syncAudioConnections();
			const transceivers = [
				...screen
					.getVideoTracks()
					.map((track) => pc.addTransceiver(track, { direction: "sendonly" })),
				pc.addTransceiver(mixedTrack, { direction: "sendonly" }),
			];
			transceiversRef.current = transceivers;

			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);

			const pushRes = await pushTracks({
				data: {
					sessionId,
					sdp: offer.sdp ?? "",
					tracks: transceivers.map(({ mid, sender }, _i) => ({
						location: "local",
						mid: mid ?? "",
						trackName: sender.track?.kind === "audio" ? "audio" : "video",
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

			const maxBitrate =
				fps <= 15 ? 1_000_000 : fps >= 60 ? 2_000_000 : 1_500_000;
			const videoTransceiver = transceivers.find(
				(t) => t.sender.track?.kind === "video",
			);
			if (videoTransceiver) {
				const params = videoTransceiver.sender.getParameters();
				if (!params.encodings || params.encodings.length === 0) {
					params.encodings = [{}];
				}
				params.encodings[0].maxBitrate = maxBitrate;
				await videoTransceiver.sender.setParameters(params);
			}

			setStreamCode(sessionId);
			setSharing(true);
		} catch (err) {
			if (err instanceof Error && err.name !== "AbortError") {
				setError(err.message);
			}
		}
	}, [stopSharing, resolution, fps, ensureAudioMix, syncAudioConnections]);

	if (!sharing) {
		return (
			<div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
				<div className="w-full max-w-sm space-y-6">
					<h1 className="text-2xl font-bold text-center">Lobby Cast</h1>

					{error && <p className="text-red-400 text-sm text-center">{error}</p>}

					{audioWarning && (
						<div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
							<AlertTriangle
								size={16}
								className="text-amber-400 mt-0.5 shrink-0"
							/>
							<p className="text-xs text-amber-300">
								Áudio do sistema não capturado. Ao selecionar a tela/janela para
								compartilhar, marque a opção{" "}
								<strong>"Compartilhar áudio do sistema"</strong> no navegador.
							</p>
						</div>
					)}

					<div className="flex gap-3">
						<div className="flex-1 space-y-1">
							<span className="text-xs text-zinc-500">Resolução</span>
							<Select
								value={resolution}
								onValueChange={(v) => setResolution(v as "720" | "1080")}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="720">720p</SelectItem>
									<SelectItem value="1080">1080p</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="flex-1 space-y-1">
							<span className="text-xs text-zinc-500">FPS</span>
							<Select
								value={String(fps)}
								onValueChange={(v) => setFps(Number(v))}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="5">5</SelectItem>
									<SelectItem value="15">15</SelectItem>
									<SelectItem value="24">24</SelectItem>
									<SelectItem value="30">30</SelectItem>
									<SelectItem value="60">60</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<Button onClick={startSharing} className="w-full" size="lg">
						Iniciar transmissão
					</Button>

					<div className="relative">
						<div className="absolute inset-0 flex items-center">
							<div className="w-full border-t border-zinc-700" />
						</div>
						<div className="relative flex justify-center text-xs">
							<span className="bg-zinc-950 px-2 text-zinc-500">ou</span>
						</div>
					</div>

					<div className="space-y-2">
						<Input
							value={newCode}
							onChange={(e) => setNewCode(e.target.value)}
							placeholder="Cole o link ou código da live"
						/>
						<Button
							variant="secondary"
							onClick={() => {
								const code = extractStreamId(newCode);
								if (code) {
									navigate({
										to: "/watch/$streamId",
										params: { streamId: code },
									});
								}
							}}
							disabled={!newCode.trim()}
							className="w-full"
							size="lg"
						>
							Assistir
						</Button>
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

						<div className="flex items-center gap-3 px-1">
							<Toggle
								pressed={muted}
								onPressedChange={toggleMute}
								variant="outline"
								size="sm"
							>
								{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
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
								className="flex-1"
							/>
						</div>

						{streamCode && (
							<div className="space-y-2">
								<p className="text-sm text-zinc-400 text-center">
									Compartilhe sua live:
								</p>
								<div className="flex gap-2">
									<Input
										readOnly
										value={`${window.location.origin}/watch/${streamCode}`}
										className="flex-1 font-mono"
									/>
									<Button
										variant="secondary"
										onClick={() => navigator.clipboard.writeText(streamCode)}
									>
										Código
									</Button>
									<Button
										variant="secondary"
										onClick={() =>
											navigator.clipboard.writeText(
												`${window.location.origin}/watch/${streamCode}`,
											)
										}
									>
										Link
									</Button>
								</div>
							</div>
						)}
					</div>
				) : (
					<div
						className={`flex flex-wrap gap-3 w-full max-w-6xl ${watchJustify}`}
					>
						{watchIds.map((id, i) => (
							<div key={id} className={`${watchWidths[i]} min-h-[300px]`}>
								<StreamPlayer
									streamId={id}
									selfStreamId={streamCode ?? undefined}
								/>
							</div>
						))}
					</div>
				)}
			</div>

			<div className="border-t border-zinc-800 p-3">
				<div className="flex items-center gap-2 flex-wrap">
					<Input
						value={newCode}
						onChange={(e) => setNewCode(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") addWatch();
						}}
						placeholder="Adicionar outra live"
						className="flex-1"
					/>
					<Button
						variant="secondary"
						size="sm"
						onClick={addWatch}
						disabled={!newCode.trim()}
					>
						Adicionar
					</Button>

					<div className="w-px h-5 bg-zinc-700" />

					<Select
						value={resolution}
						onValueChange={(v) => setResolution(v as "720" | "1080")}
					>
						<SelectTrigger size="sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="720">720p</SelectItem>
							<SelectItem value="1080">1080p</SelectItem>
						</SelectContent>
					</Select>

					<Select value={String(fps)} onValueChange={(v) => setFps(Number(v))}>
						<SelectTrigger size="sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="5">5 fps</SelectItem>
							<SelectItem value="15">15 fps</SelectItem>
							<SelectItem value="24">24 fps</SelectItem>
							<SelectItem value="30">30 fps</SelectItem>
							<SelectItem value="60">60 fps</SelectItem>
						</SelectContent>
					</Select>

					<Button variant="secondary" size="sm" onClick={applyResolution}>
						Aplicar
					</Button>

					<Button variant="secondary" size="sm" onClick={changeScreen}>
						<Monitor size={14} />
						Trocar tela
					</Button>

					<Button variant="secondary" size="sm" onClick={toggleWebcam}>
						<Camera size={14} />
						{webcamMode ? "Voltar para tela" : "Câmera"}
					</Button>

					{audioWarning && (
						<div
							className="flex items-center gap-1.5 text-xs text-amber-400"
							title="O Firefox pode não disponibilizar áudio do sistema ao compartilhar tela. Use o mic como fallback."
						>
							<AlertTriangle size={14} />
							Sem áudio
						</div>
					)}
					<Toggle
						pressed={!audioEnabled}
						onPressedChange={toggleAudio}
						variant="outline"
						size="sm"
					>
						{audioEnabled ? <Mic size={14} /> : <MicOff size={14} />}
						{audioEnabled ? "Áudio" : "Sem áudio"}
					</Toggle>
					<Toggle
						pressed={micEnabled}
						onPressedChange={toggleMic}
						variant="outline"
						size="sm"
						disabled={!audioEnabled}
					>
						{micEnabled ? <Mic size={14} /> : <MicOff size={14} />}
						Mic
					</Toggle>
					<div className="flex-1" />

					<div
						className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800"
						title={
							viewerCount === null
								? "Configure o Supabase para ver espectadores ao vivo"
								: "Espectadores ao vivo"
						}
					>
						<span className="flex items-center gap-1.5 text-xs text-zinc-300">
							<span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
							{formatElapsed(elapsedMs)}
						</span>
						{viewerCount !== null && (
							<span className="flex items-center gap-1.5 text-xs text-zinc-300">
								<Eye size={14} className="text-emerald-400" />
								{viewerCount} assistindo
							</span>
						)}
					</div>

					<Button
						variant="secondary"
						size="sm"
						onClick={() => navigate({ to: "/" })}
					>
						Voltar
					</Button>

					<Button variant="destructive" size="sm" onClick={stopSharing}>
						Parar
					</Button>
				</div>
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
							<Toggle
								pressed={muted}
								onPressedChange={toggleMute}
								variant="default"
								size="sm"
							>
								{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
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
								className="flex-1"
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
