import { useCallback, useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.3;

export function useZoomPan() {
	const [scale, setScale] = useState(1);
	const [translate, setTranslate] = useState({ x: 0, y: 0 });
	const isPanning = useRef(false);
	const lastMouse = useRef({ x: 0, y: 0 });

	const clampTranslate = useCallback((tx: number, ty: number, s: number) => {
		if (s <= 1) return { x: 0, y: 0 };
		const maxTx = ((s - 1) / 2) * 100;
		const maxTy = ((s - 1) / 2) * 100;
		return {
			x: Math.max(-maxTx, Math.min(maxTx, tx)),
			y: Math.max(-maxTy, Math.min(maxTy, ty)),
		};
	}, []);

	const onWheel = useCallback(
		(e: React.WheelEvent) => {
			e.preventDefault();
			const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;

			setScale((prev) => {
				const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev + delta));
				if (next <= 1) {
					setTranslate({ x: 0, y: 0 });
				} else {
					setTranslate((t) => clampTranslate(t.x, t.y, next));
				}
				return next;
			});
		},
		[clampTranslate],
	);

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (scale <= 1) return;
			isPanning.current = true;
			lastMouse.current = { x: e.clientX, y: e.clientY };
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
		},
		[scale],
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!isPanning.current) return;
			const dx = e.clientX - lastMouse.current.x;
			const dy = e.clientY - lastMouse.current.y;
			lastMouse.current = { x: e.clientX, y: e.clientY };

			setTranslate((prev) => {
				const container = (e.target as HTMLElement).closest(
					"[data-zoom-container]",
				);
				if (!container) return prev;
				const rect = container.getBoundingClientRect();
				const pctX = (dx / rect.width) * 100;
				const pctY = (dy / rect.height) * 100;
				return clampTranslate(prev.x + pctX, prev.y + pctY, scale);
			});
		},
		[scale, clampTranslate],
	);

	const onPointerUp = useCallback(() => {
		isPanning.current = false;
	}, []);

	const reset = useCallback(() => {
		setScale(1);
		setTranslate({ x: 0, y: 0 });
	}, []);

	const setPanFromMinimap = useCallback(
		(x: number, y: number) => {
			setTranslate(clampTranslate(x, y, scale));
		},
		[scale, clampTranslate],
	);

	return {
		scale,
		translate,
		onWheel,
		onPointerDown,
		onPointerMove,
		onPointerUp,
		reset,
		setPanFromMinimap,
		isPanning: isPanning.current,
	};
}
