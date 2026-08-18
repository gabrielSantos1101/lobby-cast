import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

export function Draggable({
	children,
	initialX = 16,
	initialY = 16,
}: {
	children: ReactNode;
	initialX?: number;
	initialY?: number;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [pos, setPos] = useState({ x: initialX, y: initialY });
	const [dragging, setDragging] = useState(false);
	const offset = useRef({ x: 0, y: 0 });

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			const el = ref.current;
			if (!el) return;
			const tag = (e.target as HTMLElement).tagName;
			if (tag === "BUTTON" || tag === "INPUT") return;
			setDragging(true);
			offset.current = {
				x: e.clientX - pos.x,
				y: e.clientY - pos.y,
			};
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
		},
		[pos],
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!dragging) return;
			const x = e.clientX - offset.current.x;
			const y = e.clientY - offset.current.y;
			const maxX = window.innerWidth - (ref.current?.offsetWidth ?? 0);
			const maxY = window.innerHeight - (ref.current?.offsetHeight ?? 0);
			setPos({
				x: Math.max(0, Math.min(x, maxX)),
				y: Math.max(0, Math.min(y, maxY)),
			});
		},
		[dragging],
	);

	const onPointerUp = useCallback(() => {
		setDragging(false);
	}, []);

	useEffect(() => {
		if (!dragging) return;
		const up = () => setDragging(false);
		window.addEventListener("pointerup", up);
		return () => window.removeEventListener("pointerup", up);
	}, [dragging]);

	return (
		<div
			ref={ref}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			className="fixed z-50 touch-none select-none"
			style={{
				left: pos.x,
				top: pos.y,
				cursor: dragging ? "grabbing" : "grab",
			}}
		>
			{children}
		</div>
	);
}
