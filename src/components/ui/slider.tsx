import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "#/lib/utils.ts";

function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	...props
}: SliderPrimitive.Root.Props) {
	const _values = Array.isArray(value)
		? value
		: Array.isArray(defaultValue)
			? defaultValue
			: [min, max];

	return (
		<SliderPrimitive.Root
			className={cn(
				"relative flex w-full touch-none items-center select-none",
				className,
			)}
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			thumbAlignment="edge"
			{...props}
		>
			<SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none disabled:opacity-50">
				<SliderPrimitive.Track
					data-slot="slider-track"
					className="relative w-full grow overflow-hidden rounded-full bg-muted h-1"
				>
					<SliderPrimitive.Indicator
						data-slot="slider-range"
						className="absolute h-full bg-primary"
					/>
				</SliderPrimitive.Track>
				{Array.from({ length: _values.length }, (_, index) => (
					<SliderPrimitive.Thumb
						data-slot="slider-thumb"
						// biome-ignore lint/suspicious/noArrayIndexKey: slider thumbs are stable
						key={index}
						className="relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50"
					/>
				))}
			</SliderPrimitive.Control>
		</SliderPrimitive.Root>
	);
}

export { Slider };
