import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({ component: Home });

function extractStreamId(input: string): string {
	const trimmed = input.trim();
	const watchPrefix = "/watch/";
	if (trimmed.includes(watchPrefix)) {
		const idx = trimmed.indexOf(watchPrefix);
		return trimmed.slice(idx + watchPrefix.length);
	}
	return trimmed;
}

function Home() {
	const navigate = useNavigate();
	const [code, setCode] = useState("");

	return (
		<div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
			<div className="w-full max-w-sm space-y-6">
				<h1 className="text-2xl font-bold text-center">Lobby Cast</h1>

				<button
					type="button"
					onClick={() => navigate({ to: "/share" })}
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
						value={code}
						onChange={(e) => setCode(e.target.value)}
						placeholder="Cole o link ou código da live"
						className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
					/>
					<button
						type="button"
						onClick={() => {
							const streamId = extractStreamId(code);
							if (streamId) {
								navigate({
									to: "/watch/$streamId",
									params: { streamId },
								});
							}
						}}
						disabled={!code.trim()}
						className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors cursor-pointer"
					>
						Assistir
					</button>
				</div>
			</div>
		</div>
	);
}
