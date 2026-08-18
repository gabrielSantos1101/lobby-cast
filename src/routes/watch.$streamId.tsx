import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ClientOnly } from "#/components/client-only";
import { StreamPlayer } from "#/components/stream-player";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { getStreamWidths } from "#/lib/stream-layout";

export const Route = createFileRoute("/watch/$streamId")({
	component: Watch,
});

function Watch() {
	const { streamId: initialStreamId } = Route.useParams();
	console.log("[Watch] rendering, initialStreamId:", initialStreamId);
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
						<ClientOnly>
							<StreamPlayer streamId={id} />
						</ClientOnly>
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
