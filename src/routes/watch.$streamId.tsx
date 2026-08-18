import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { X } from "lucide-react";
import { StreamPlayer } from "#/components/stream-player";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { getStreamWidths } from "#/lib/stream-layout";

export const Route = createFileRoute("/watch/$streamId")({
	component: Watch,
});

function Watch() {
	const { streamId: initialStreamId } = Route.useParams();
	const navigate = useNavigate();
	const [streamIds, setStreamIds] = useState<string[]>([initialStreamId]);
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
				return next;
			});
		},
		[navigate],
	);

	const widths = getStreamWidths(streamIds.length);
	const justify = streamIds.length === 3 ? "justify-center" : "";

	const isSingle = streamIds.length === 1;

	return (
		<div className="min-h-screen bg-zinc-950 text-white flex flex-col p-4">
			<h1 className="text-2xl font-bold text-center mb-4">Assistindo transmissão</h1>

			<div
				className={`flex flex-wrap gap-3 w-full max-w-6xl mx-auto flex-1 ${justify} ${isSingle ? "items-center" : "items-start"}`}
			>
				{streamIds.map((id, i) => (
					<div
						key={id}
						className={`${widths[i]} ${isSingle ? "max-w-full max-h-[calc(100vh-200px)]" : "aspect-video"} relative`}
					>
						<button
							type="button"
							onClick={() => removeStream(id)}
							className="absolute top-2 right-2 z-10 bg-black/60 hover:bg-black/80 rounded-full p-1 text-white transition-colors"
						>
							<X size={16} />
						</button>
						<StreamPlayer streamId={id} />
					</div>
				))}
			</div>

			<div className="flex gap-2 w-full max-w-6xl">
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
