import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { StreamPlayer } from "#/components/stream-player";
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

	const _removeStream = useCallback(
		(id: string) => {
			setStreamIds((prev) => {
				const next = prev.filter((s) => s !== id);
				if (next.length === 0) navigate({ to: "/" });
				return next;
			});
		},
		[navigate],
	);

	const widths = getStreamWidths(streamIds.length);
	const justify = streamIds.length === 3 ? "justify-center" : "";

	return (
		<div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center p-4 gap-4">
			<h1 className="text-2xl font-bold">Assistindo transmissão</h1>

			<div
				className={`flex flex-wrap gap-3 w-full max-w-6xl flex-1 ${justify}`}
			>
				{streamIds.map((id, i) => (
					<div key={id} className={`${widths[i]} min-h-[300px]`}>
						<StreamPlayer streamId={id} />
					</div>
				))}
			</div>

			<div className="flex gap-2 w-full max-w-6xl">
				<input
					type="text"
					value={newCode}
					onChange={(e) => setNewCode(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") addStream();
					}}
					placeholder="Adicionar outra live (cole o link ou código)"
					className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-sm placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
				/>
				<button
					type="button"
					onClick={addStream}
					disabled={!newCode.trim()}
					className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer"
				>
					Adicionar
				</button>
				<button
					type="button"
					onClick={() => navigate({ to: "/" })}
					className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
				>
					Sair
				</button>
			</div>
		</div>
	);
}
