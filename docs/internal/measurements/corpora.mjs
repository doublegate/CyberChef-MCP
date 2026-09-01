export const CODE = `function bake(input, recipe) {
    const dish = new Dish(input);
    for (const op of recipe) {
        dish.set(await op.run(dish.get(op.inputType)));
    }
    return dish;
}

export function sanitizeToolName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

class ToolRegistry {
    constructor(reserved) { this.reserved = new Set(reserved); this.tools = new Map(); }
}
`;
export const LOG = `2026-09-01T00:00:01Z INFO request_start tool=cyberchef_bake inputSize=1284
2026-09-01T00:00:02Z WARN rate_limit_near tool=cyberchef_search remaining=7
2026-09-01T00:00:04Z INFO request_complete tool=cyberchef_magic duration=31ms cached=false
2026-09-01T00:00:09Z ERROR operation_failed tool=cyberchef_gunzip reason=invalid_crc
2026-09-01T00:01:17Z INFO session_opened transport=socket peer=uid1000 active=2
`;
