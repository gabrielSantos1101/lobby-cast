import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { X } from "lucide-react";
import { StreamPlayer } from "#/components/stream-player";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";

export const Route = createFileRoute("/watch/$streamId")({
	component: Watch,
});

function Watch() {
	const { streamId: initialStreamId } = Route.useParams();
	const navigate = useNavigate();
	const [streamIds, setStreamIds] = useState<string[]>([initialStreamId]);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [newCode, setNewCode] = useState("");

	const addStream = useCallback(() => {
		const code = newCode.trim();
		if (code && !streamIds.includes(code)) {
			setStreamIds((prev) => [...prev, code]);
			setNewCode("");
		}
	}, [newCode, streamIds]);

	const removeStream = useCallback(
		(id: string) => {
			setStreamIds((prev) => {
				const next = prev.filter((s) => s !== id);
				if (next.length === 0) {
					navigate({ to: "/" });
					return prev;
				}
				if (focusedId === id) {
					setFocusedId(null);
				}
				return next;
			});
		},
		[navigate, focusedId],
	);

	const swapFocused = useCallback(() => {
		if (streamIds.length < 2) return;
		const other = streamIds.find((id) => id !== focusedId);
		setFocusedId(other ?? null);
	}, [streamIds, focusedId]);

	const hasTwo = streamIds.length === 2;
	const isFocused = (id: string) =>
		hasTwo && focusedId !== null && focusedId !== id;

	return (
		<div className="min-h-screen bg-zinc-950 text-white flex flex-col p-4">
			<h1 className="text-2xl font-bold text-center mb-4">Assistindo transmissão</h1>

			<div className="flex-1 flex items-center justify-center">
				{streamIds.length === 1 ? (
					<div className="w-full max-w-full max-h-[calc(100vh-200px)]">
						<div className="relative w-full h-full">
							<button
								type="button"
								onClick={() => removeStream(streamIds[0])}
								className="absolute top-2 right-2 z-10 bg-black/60 hover:bg-black/80 rounded-full p-1 text-white transition-colors"
							>
								<X size={16} />
							</button>
							<StreamPlayer streamId={streamIds[0]} />
						</div>
					</div>
				) : (
					<div className="w-full max-w-7xl h-full relative">
						{streamIds.map((id) => (
							<div
								key={id}
								onClick={() => setFocusedId(id)}
								className={`absolute transition-all duration-300 ease-in-out ${
									isFocused(id)
										? "bottom-2 right-2 w-48 aspect-video z-10"
										: "inset-0 z-0"
								}`}
							>
								<div className="relative w-full h-full">
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											removeStream(id);
										}}
										className="absolute top-2 right-2 z-20 bg-black/60 hover:bg-black/80 rounded-full p-1 text-white transition-colors"
									>
										<X size={16} />
									</button>
									<StreamPlayer streamId={id} />
								</div>
							</div>
						))}

						{hasTwo && (
							<button
								type="button"
								onClick={swapFocused}
								className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-black/60 hover:bg-black/80 rounded-full px-3 py-1 text-sm text-white transition-colors"
							>
								Clique para trocar
							</button>
						)}
					</div>
				)}
			</div>

			<div className="flex gap-2 w-full max-w-7xl">
				<Input
					value={newCode}
					onChange={(e) => setNewCode(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") addStream();
					}}
					placeholder="Adicionar outra live (cole o link ou código)"
					className="flex-1"
				/>
				<Button
					variant="secondary"
					onClick={addStream}
					disabled={!newCode.trim()}
				>
					Adicionar
				</Button>
				<Button variant="destructive" onClick={() => navigate({ to: "/" })}>
					Sair
				</Button>
			</div>
		</div>
	);
}
