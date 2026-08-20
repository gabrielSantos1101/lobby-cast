import { useCallback, useRef, useState } from "react";

interface ZoomMinimapProps {
	scale: number;
	translateX: number;
	translateY: number;
	onPanChange: (x: number, y: number) => void;
	onReset: () => void;
}

export function ZoomMinimap({
	scale,
	translateX,
	translateY,
	onPanChange,
	onReset,
}: ZoomMinimapProps) {
	const mapRef = useRef<HTMLDivElement>(null);
	const [dragging, setDragging] = useState(false);
	const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

	const viewSize = 100 / scale;
	const viewX = 50 - viewSize / 2 - (translateX / 100) * viewSize;
	const viewY = 50 - viewSize / 2 - (translateY / 100) * viewSize;

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			e.stopPropagation();
			setDragging(true);
			dragStart.current = {
				x: e.clientX,
				y: e.clientY,
				tx: translateX,
				ty: translateY,
			};
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
		},
		[translateX, translateY],
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!dragging || !mapRef.current) return;
			const rect = mapRef.current.getBoundingClientRect();
			const dx = ((e.clientX - dragStart.current.x) / rect.width) * 100;
			const dy = ((e.clientY - dragStart.current.y) / rect.height) * 100;

			const maxPan = ((scale - 1) / 2) * 100;
			const newX = Math.max(
				-maxPan,
				Math.min(maxPan, dragStart.current.tx - dx * scale),
			);
			const newY = Math.max(
				-maxPan,
				Math.min(maxPan, dragStart.current.ty - dy * scale),
			);
			onPanChange(newX, newY);
		},
		[dragging, scale, onPanChange],
	);

	const handlePointerUp = useCallback(() => {
		setDragging(false);
	}, []);

	if (scale <= 1) return null;

	return (
		<div className="absolute bottom-14 right-2 z-20 flex flex-col items-end gap-1">
			<button
				type="button"
				onClick={onReset}
				className="bg-black/70 hover:bg-black/90 text-white text-[10px] px-1.5 py-0.5 rounded cursor-pointer"
			>
				{Math.round(scale * 100)}%
			</button>

			<div
				ref={mapRef}
				className="w-28 aspect-video bg-zinc-900/80 border border-zinc-600 rounded-sm relative overflow-hidden cursor-crosshair"
			>
				<div
					className="absolute border-2 border-white/70 bg-white/10 rounded-[1px]"
					style={{
						left: `${Math.max(0, viewX)}%`,
						top: `${Math.max(0, viewY)}%`,
						width: `${viewSize}%`,
						height: `${viewSize}%`,
						cursor: dragging ? "grabbing" : "grab",
					}}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
				/>
			</div>
		</div>
	);
}
