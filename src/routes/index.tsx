import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";

export const Route = createFileRoute("/")({ component: Home });

function extractStreamId(input: string): string {
	const trimmed = input.trim();
	const watchPrefix = "/watch/";
	if (trimmed.includes(watchPrefix)) {
		const idx = trimmed.indexOf(watchPrefix);
		return trimmed.slice(idx + watchPrefix.length).split(/[?#]/)[0] ?? "";
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

				<Button
					onClick={() => navigate({ to: "/share" })}
					className="w-full"
					size="lg"
				>
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
						value={code}
						onChange={(e) => setCode(e.target.value)}
						placeholder="Cole o link ou código da live"
					/>
					<Button
						variant="secondary"
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
