# Performance

The server is designed for interactive use: a model calls a tool, a person waits. Everything below
is about keeping that under a second in the common case, and bounded in the uncommon one.

## What is on by default

| | Default | |
|---|---|---|
| **Result cache** | on | LRU, 100 MB / 1,000 items. Keyed on operation + input + arguments |
| **Streaming** | on | Inputs over 10 MB stream rather than buffering |
| **Batch** | on | Up to 100 operations per `cyberchef_batch` call |
| **Worker threads** | **off** | Opt-in with `CYBERCHEF_ENABLE_WORKERS=true` |
| **Telemetry** | **off** | Privacy-first. Local only even when enabled |
| **Rate limiting** | off | |

## Measured costs

From the release benchmark suite, median latency:

| | 1 KB | 10 KB | 100 KB |
|---|---|---|---|
| To Base64 | 0.09 ms | 0.23 ms | 1.7 ms |
| To Hex | 0.11 ms | 0.49 ms | 21 ms |
| MD5 | 0.10 ms | 0.63 ms | 7.1 ms |
| SHA2 | 0.10 ms | 0.54 ms | 5.7 ms |
| Gzip | 0.40 ms | 3.3 ms | 305 ms |

Start-up is about **1.3 seconds**, nearly all of it building 504 operation schemas. Restricting the
[tool surface](Tool-Surface) does not change that — the schemas are built either way; it changes
what is *sent*.

The [analysis tools](Analysis-Tools) are different in kind, because their cost comes from the shape
of the input rather than its size:

| | |
|---|---|
| `xor_key_length`, 1 MB at max key length 256 | 594 ms |
| `cyclic_pattern`, 1 MB generated | 70 ms |
| `hash_identify` | under 1 ms |
| `rsa_attack`, 16,384-bit modulus, 100,000 Fermat iterations | 3.5 s, with a 10 s hard stop |

## The cache

On by default and usually the largest single win, because an assistant re-runs the same decode more
often than you would guess.

Cached results are rendered through the same content-block path as fresh ones. That is not
cosmetic: when the cache returned raw values instead, the first call to `cyberchef_generate_qr_code`
produced an `image` block and every subsequent call produced text.

```
cyberchef_cache_stats    hit rate, size, evictions
cyberchef_cache_clear    empty it
```

Disable with `CYBERCHEF_CACHE_ENABLED=false` if inputs are sensitive and you would rather they not
sit in memory.

## Quotas and limits

```
cyberchef_quota_info    concurrent operations, totals, limits, rate-limit state
cyberchef_worker_stats  worker pool, when enabled
```

Per-call timeout is 30 s and applies to the analysis tools as well. Note that a **synchronous** loop
cannot be interrupted by a timeout — `Promise.race` does not cancel the loser — which is why the
expensive analysis loops yield periodically *and* check a deadline themselves.

## Telemetry

Off by default. When enabled with `CYBERCHEF_TELEMETRY_ENABLED=true` it records call counts,
durations, input and output sizes, and error rates **in the process**. Nothing leaves it unless you
call `cyberchef_telemetry_export`.

## Making it faster

1. **Use `cyberchef_bake` for chains.** A five-step decode as one call beats five calls: one
   round trip, one cache entry, one quota slot.
2. **Use `cyberchef_batch`** for the same operation over many inputs.
3. **Leave the cache on.**
4. **Restrict the tool surface** if context is your bottleneck rather than latency — 4,900 tokens
   against 100,000 on every request.
5. **Enable workers** only for large inputs; the pool costs more than it saves on small ones.
