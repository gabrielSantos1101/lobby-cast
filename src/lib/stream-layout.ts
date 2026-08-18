export function getStreamWidths(count: number): string[] {
	if (count <= 0) return [];
	if (count === 1) return ["w-full"];
	if (count === 2) return ["w-[calc(50%-0.375rem)]", "w-[calc(50%-0.375rem)]"];
	if (count === 3)
		return [
			"w-[calc(50%-0.375rem)]",
			"w-[calc(50%-0.375rem)]",
			"w-[calc(50%-0.375rem)]",
		];
	if (count === 4)
		return [
			"w-[calc(50%-0.375rem)]",
			"w-[calc(50%-0.375rem)]",
			"w-[calc(50%-0.375rem)]",
			"w-[calc(50%-0.375rem)]",
		];
	// 5+: 3 per row
	return Array.from({ length: count }, () => "w-[calc(33.333%-0.5rem)]");
}
