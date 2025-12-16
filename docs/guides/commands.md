# CyberChef MCP Server Commands

This document lists all available operations exposed by the CyberChef MCP server.

## Usage

All operations are prefixed with `cyberchef_`. 
Every operation takes a required `input` string argument.
Most operations have optional arguments that map to the CyberChef configuration.

**Example JSON-RPC Call:**
```json
{
  "name": "cyberchef_to_base64",
  "arguments": {
    "input": "Hello World",
    "alphabet": "A-Za-z0-9+/=" 
  }
}
```

---

## Utility Tools

### cyberchef_bake
Execute a complex recipe.
*   `input`: The input data.
*   `recipe`: JSON array of operations.

### cyberchef_search
Search for an operation.
*   `query`: Search term.

---

## Advanced Tools (v1.7.0)

### cyberchef_batch
Execute multiple CyberChef operations in a single request with parallel or sequential execution.

**Arguments:**
*   `operations` (array): Array of operation objects, each with `tool` and `arguments` fields.
*   `mode` (enum: ["parallel", "sequential"]): Execution mode. Default: "parallel"

**Features:**
- Parallel execution for maximum performance
- Sequential execution for deterministic results
- Partial success support - continues even if some operations fail
- Maximum batch size: 100 operations (configurable via `CYBERCHEF_BATCH_MAX_SIZE`)

**Example:**
```json
{
  "name": "cyberchef_batch",
  "arguments": {
    "operations": [
      { "tool": "cyberchef_to_base64", "arguments": { "input": "Hello" } },
      { "tool": "cyberchef_sha256", "arguments": { "input": "World" } }
    ],
    "mode": "parallel"
  }
}
```

**Response:**
```json
{
  "total": 2,
  "successful": 2,
  "failed": 0,
  "mode": "parallel",
  "results": [
    { "index": 0, "result": "SGVsbG8=" },
    { "index": 1, "result": "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9" }
  ],
  "errors": []
}
```

### cyberchef_telemetry_export
Export collected telemetry metrics for monitoring and analysis.

**Arguments:**
*   `format` (enum: ["json", "summary"]): Export format. Default: "json"

**Features:**
- Privacy-first: No input/output data collected
- Metrics collected: tool name, duration, data sizes, success status, cache hits
- Statistics: total calls, success rate, average duration, cache hit rate
- Disabled by default (enable via `CYBERCHEF_TELEMETRY_ENABLED=true`)

**Example (Summary):**
```json
{
  "name": "cyberchef_telemetry_export",
  "arguments": { "format": "summary" }
}
```

**Response:**
```json
{
  "totalCalls": 1523,
  "successRate": "98.42%",
  "avgDuration": "145ms",
  "cacheHitRate": "23.45%"
}
```

### cyberchef_cache_stats
Get real-time cache statistics including size, items, and limits.

**Arguments:** None

**Example:**
```json
{
  "name": "cyberchef_cache_stats",
  "arguments": {}
}
```

**Response:**
```json
{
  "items": 42,
  "size": 1048576,
  "maxSize": 104857600,
  "maxItems": 1000
}
```

### cyberchef_cache_clear
Clear all cached operation results. Useful for freeing memory or forcing fresh execution.

**Arguments:** None

**Example:**
```json
{
  "name": "cyberchef_cache_clear",
  "arguments": {}
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cache cleared"
}
```

### cyberchef_quota_info
Get current resource quota information including concurrent operations, data sizes, and limits.

**Arguments:** None

**Example:**
```json
{
  "name": "cyberchef_quota_info",
  "arguments": {}
}
```

**Response:**
```json
{
  "quota": {
    "concurrentOperations": 2,
    "maxConcurrentOperations": 10,
    "totalOperations": 1523,
    "totalInputSize": 15728640,
    "totalOutputSize": 23592960,
    "inputSizeMB": "15.00",
    "outputSizeMB": "22.50",
    "maxInputSizeMB": "100.00"
  },
  "rateLimit": {
    "enabled": false,
    "maxRequests": 100,
    "windowMs": 60000,
    "activeConnections": 3,
    "totalTrackedRequests": 156
  }
}
```

---

## Operation Tools (By Category)

### Favourites

### Data format

#### To Hexdump (`cyberchef_to_hexdump`)
Creates a hexdump of the input data, displaying both the hexadecimal values of each byte and an ASCII representation alongside.

The 'UNIX format' argument defines which subset of printable characters are displayed in the preview column.

**Arguments:**
*   `width` (number): Default: 16
*   `upper_case_hex` (boolean): Default: false
*   `include_final_length` (boolean): Default: false
*   `unix_format` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_to_hexdump", "arguments": { "input": "..." } }
```

---

#### From Hexdump (`cyberchef_from_hexdump`)
Attempts to convert a hexdump back into raw data. This operation supports many different hexdump variations, but probably not all. Make sure you verify that the data it gives you is correct before continuing analysis.

**Example:**
```json
{ "name": "cyberchef_from_hexdump", "arguments": { "input": "..." } }
```

---

#### To Hex (`cyberchef_to_hex`)
Converts the input string to hexadecimal bytes separated by the specified delimiter.

e.g. The UTF-8 encoded string Γειά σου becomes ce 93 ce b5 ce b9 ce ac 20 cf 83 ce bf cf 85 0a

**Arguments:**
*   `delimiter` (Enum: [Space, Percent, Comma, Semi-colon, Colon, ...]): Default: Space,Percent,Comma,Semi-colon,Colon,Line feed,CRLF,0x,0x with comma,\x,None
*   `bytes_per_line` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_to_hex", "arguments": { "input": "..." } }
```

---

#### From Hex (`cyberchef_from_hex`)
Converts a hexadecimal byte string back into its raw value.

e.g. ce 93 ce b5 ce b9 ce ac 20 cf 83 ce bf cf 85 0a becomes the UTF-8 encoded string Γειά σου

**Arguments:**
*   `delimiter` (Enum: [Auto, Space, Percent, Comma, Semi-colon, ...]): Default: Auto,Space,Percent,Comma,Semi-colon,Colon,Line feed,CRLF,0x,0x with comma,\x,None

**Example:**
```json
{ "name": "cyberchef_from_hex", "arguments": { "input": "..." } }
```

---

#### To Charcode (`cyberchef_to_charcode`)
Converts text to its unicode character code equivalent.

e.g. Γειά σου becomes 0393 03b5 03b9 03ac 20 03c3 03bf 03c5

**Arguments:**
*   `delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Line feed, ...]): Default: Space,Comma,Semi-colon,Colon,Line feed,CRLF
*   `base` (number): Default: 16

**Example:**
```json
{ "name": "cyberchef_to_charcode", "arguments": { "input": "..." } }
```

---

#### From Charcode (`cyberchef_from_charcode`)
Converts unicode character codes back into text.

e.g. 0393 03b5 03b9 03ac 20 03c3 03bf 03c5 becomes Γειά σου

**Arguments:**
*   `delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Line feed, ...]): Default: Space,Comma,Semi-colon,Colon,Line feed,CRLF
*   `base` (number): Default: 16

**Example:**
```json
{ "name": "cyberchef_from_charcode", "arguments": { "input": "..." } }
```

---

#### To Decimal (`cyberchef_to_decimal`)
Converts the input data to an ordinal integer array.

e.g. Hello becomes 72 101 108 108 111

**Arguments:**
*   `delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Line feed, ...]): Default: Space,Comma,Semi-colon,Colon,Line feed,CRLF
*   `support_signed_values` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_to_decimal", "arguments": { "input": "..." } }
```

---

#### From Decimal (`cyberchef_from_decimal`)
Converts the data from an ordinal integer array back into its raw form.

e.g. 72 101 108 108 111 becomes Hello

**Arguments:**
*   `delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Line feed, ...]): Default: Space,Comma,Semi-colon,Colon,Line feed,CRLF
*   `support_signed_values` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_from_decimal", "arguments": { "input": "..." } }
```

---

#### To Float (`cyberchef_to_float`)
Convert to IEEE754 Floating Point Numbers

**Arguments:**
*   `endianness` (Enum: [Big Endian, Little Endian]): Default: Big Endian,Little Endian
*   `size` (Enum: [Float (4 bytes), Double (8 bytes)]): Default: Float (4 bytes),Double (8 bytes)
*   `delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Line feed, ...]): Default: Space,Comma,Semi-colon,Colon,Line feed,CRLF

**Example:**
```json
{ "name": "cyberchef_to_float", "arguments": { "input": "..." } }
```

---

#### From Float (`cyberchef_from_float`)
Convert from IEEE754 Floating Point Numbers

**Arguments:**
*   `endianness` (Enum: [Big Endian, Little Endian]): Default: Big Endian,Little Endian
*   `size` (Enum: [Float (4 bytes), Double (8 bytes)]): Default: Float (4 bytes),Double (8 bytes)
*   `delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Line feed, ...]): Default: Space,Comma,Semi-colon,Colon,Line feed,CRLF

**Example:**
```json
{ "name": "cyberchef_from_float", "arguments": { "input": "..." } }
```

---

#### To Binary (`cyberchef_to_binary`)
Displays the input data as a binary string.

e.g. Hi becomes 01001000 01101001

**Arguments:**
*   `delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Line feed, ...]): Default: Space,Comma,Semi-colon,Colon,Line feed,CRLF,None
*   `byte_length` (number): Default: 8

**Example:**
```json
{ "name": "cyberchef_to_binary", "arguments": { "input": "..." } }
```

---

#### From Binary (`cyberchef_from_binary`)
Converts a binary string back into its raw form.

e.g. 01001000 01101001 becomes Hi

**Arguments:**
*   `delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Line feed, ...]): Default: Space,Comma,Semi-colon,Colon,Line feed,CRLF,None
*   `byte_length` (number): Default: 8

**Example:**
```json
{ "name": "cyberchef_from_binary", "arguments": { "input": "..." } }
```

---

#### To Octal (`cyberchef_to_octal`)
Converts the input string to octal bytes separated by the specified delimiter.

e.g. The UTF-8 encoded string Γειά σου becomes 316 223 316 265 316 271 316 254 40 317 203 316 277 317 205

**Arguments:**
*   `delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Line feed, ...]): Default: Space,Comma,Semi-colon,Colon,Line feed,CRLF

**Example:**
```json
{ "name": "cyberchef_to_octal", "arguments": { "input": "..." } }
```

---

#### From Octal (`cyberchef_from_octal`)
Converts an octal byte string back into its raw value.

e.g. 316 223 316 265 316 271 316 254 40 317 203 316 277 317 205 becomes the UTF-8 encoded string Γειά σου

**Arguments:**
*   `delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Line feed, ...]): Default: Space,Comma,Semi-colon,Colon,Line feed,CRLF

**Example:**
```json
{ "name": "cyberchef_from_octal", "arguments": { "input": "..." } }
```

---

#### To Base32 (`cyberchef_to_base32`)
Base32 is a notation for encoding arbitrary byte data using a restricted set of symbols that can be conveniently used by humans and processed by computers. It uses a smaller set of characters than Base64, usually the uppercase alphabet and the numbers 2 to 7.

**Arguments:**
*   `alphabet` (Enum: [Standard, Hex Extended]): Default: [object Object],[object Object]

**Example:**
```json
{ "name": "cyberchef_to_base32", "arguments": { "input": "..." } }
```

---

#### From Base32 (`cyberchef_from_base32`)
Base32 is a notation for encoding arbitrary byte data using a restricted set of symbols that can be conveniently used by humans and processed by computers. It uses a smaller set of characters than Base64, usually the uppercase alphabet and the numbers 2 to 7.

**Arguments:**
*   `alphabet` (Enum: [Standard, Hex Extended]): Default: [object Object],[object Object]
*   `remove_non-alphabet_chars` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_from_base32", "arguments": { "input": "..." } }
```

---

#### To Base45 (`cyberchef_to_base45`)
Base45 is a notation for encoding arbitrary byte data using a restricted set of symbols that can be conveniently used by humans and processed by computers. The high number base results in shorter strings than with the decimal or hexadecimal system. Base45 is optimized for usage with QR codes.

**Arguments:**
*   `alphabet` (string): Default: 0-9A-Z $%*+\-./:

**Example:**
```json
{ "name": "cyberchef_to_base45", "arguments": { "input": "..." } }
```

---

#### From Base45 (`cyberchef_from_base45`)
Base45 is a notation for encoding arbitrary byte data using a restricted set of symbols that can be conveniently used by humans and processed by computers. The high number base results in shorter strings than with the decimal or hexadecimal system. Base45 is optimized for usage with QR codes.

**Arguments:**
*   `alphabet` (string): Default: 0-9A-Z $%*+\-./:
*   `remove_non-alphabet_chars` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_from_base45", "arguments": { "input": "..." } }
```

---

#### To Base58 (`cyberchef_to_base58`)
Base58 (similar to Base64) is a notation for encoding arbitrary byte data. It differs from Base64 by removing easily misread characters (i.e. l, I, 0 and O) to improve human readability.

This operation encodes data in an ASCII string (with an alphabet of your choosing, presets included).

e.g. hello world becomes StV1DL6CwTryKyV

Base58 is commonly used in cryptocurrencies (Bitcoin, Ripple, etc).

**Arguments:**
*   `alphabet` (Enum: [Bitcoin, Ripple]): Default: [object Object],[object Object]

**Example:**
```json
{ "name": "cyberchef_to_base58", "arguments": { "input": "..." } }
```

---

#### From Base58 (`cyberchef_from_base58`)
Base58 (similar to Base64) is a notation for encoding arbitrary byte data. It differs from Base64 by removing easily misread characters (i.e. l, I, 0 and O) to improve human readability.

This operation decodes data from an ASCII string (with an alphabet of your choosing, presets included) back into its raw form.

e.g. StV1DL6CwTryKyV becomes hello world

Base58 is commonly used in cryptocurrencies (Bitcoin, Ripple, etc).

**Arguments:**
*   `alphabet` (Enum: [Bitcoin, Ripple]): Default: [object Object],[object Object]
*   `remove_non-alphabet_chars` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_from_base58", "arguments": { "input": "..." } }
```

---

#### To Base62 (`cyberchef_to_base62`)
Base62 is a notation for encoding arbitrary byte data using a restricted set of symbols that can be conveniently used by humans and processed by computers. The high number base results in shorter strings than with the decimal or hexadecimal system.

**Arguments:**
*   `alphabet` (string): Default: 0-9A-Za-z

**Example:**
```json
{ "name": "cyberchef_to_base62", "arguments": { "input": "..." } }
```

---

#### From Base62 (`cyberchef_from_base62`)
Base62 is a notation for encoding arbitrary byte data using a restricted set of symbols that can be conveniently used by humans and processed by computers. The high number base results in shorter strings than with the decimal or hexadecimal system.

**Arguments:**
*   `alphabet` (string): Default: 0-9A-Za-z

**Example:**
```json
{ "name": "cyberchef_from_base62", "arguments": { "input": "..." } }
```

---

#### To Base64 (`cyberchef_to_base64`)
Base64 is a notation for encoding arbitrary byte data using a restricted set of symbols that can be conveniently used by humans and processed by computers.

This operation encodes raw data into an ASCII Base64 string.

e.g. hello becomes aGVsbG8=

**Arguments:**
*   `alphabet` (Enum: [Standard (RFC 4648): A-Za-z0-9+/=, URL safe (RFC 4648 §5): A-Za-z0-9-_, Filename safe: A-Za-z0-9+-=, itoa64: ./0-9A-Za-z=, XML: A-Za-z0-9_., ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]

**Example:**
```json
{ "name": "cyberchef_to_base64", "arguments": { "input": "..." } }
```

---

#### From Base64 (`cyberchef_from_base64`)
Base64 is a notation for encoding arbitrary byte data using a restricted set of symbols that can be conveniently used by humans and processed by computers.

This operation decodes data from an ASCII Base64 string back into its raw format.

e.g. aGVsbG8= becomes hello

**Arguments:**
*   `alphabet` (Enum: [Standard (RFC 4648): A-Za-z0-9+/=, URL safe (RFC 4648 §5): A-Za-z0-9-_, Filename safe: A-Za-z0-9+-=, itoa64: ./0-9A-Za-z=, XML: A-Za-z0-9_., ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `remove_non-alphabet_chars` (boolean): Default: true
*   `strict_mode` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_from_base64", "arguments": { "input": "..." } }
```

---

#### Show Base64 offsets (`cyberchef_show_base64_offsets`)
When a string is within a block of data and the whole block is Base64'd, the string itself could be represented in Base64 in three distinct ways depending on its offset within the block.

This operation shows all possible offsets for a given string so that each possible encoding can be considered.

**Arguments:**
*   `alphabet` (binaryString): Default: A-Za-z0-9+/=
*   `show_variable_chars_and_padding` (boolean): Default: true
*   `input_format` (Enum: [Raw, Base64]): Default: Raw,Base64

**Example:**
```json
{ "name": "cyberchef_show_base64_offsets", "arguments": { "input": "..." } }
```

---

#### To Base92 (`cyberchef_to_base92`)
Base92 is a notation for encoding arbitrary byte data using a restricted set of symbols that can be conveniently used by humans and processed by computers.

**Example:**
```json
{ "name": "cyberchef_to_base92", "arguments": { "input": "..." } }
```

---

#### From Base92 (`cyberchef_from_base92`)
Base92 is a notation for encoding arbitrary byte data using a restricted set of symbols that can be conveniently used by humans and processed by computers.

**Example:**
```json
{ "name": "cyberchef_from_base92", "arguments": { "input": "..." } }
```

---

#### To Base85 (`cyberchef_to_base85`)
Base85 (also called Ascii85) is a notation for encoding arbitrary byte data. It is usually more efficient that Base64.

This operation encodes data in an ASCII string (with an alphabet of your choosing, presets included).

e.g. hello world becomes BOu!rD]j7BEbo7

Base85 is commonly used in Adobe's PostScript and PDF file formats.

Options
AlphabetStandard - The standard alphabet, referred to as Ascii85Z85 (ZeroMQ) - A string-safe variant of Base85, which avoids quote marks and backslash charactersIPv6 - A variant of Base85 suitable for encoding IPv6 addresses (RFC 1924)Include delimiter
Adds a '' delimiter to the start and end of the data. This is standard for Adobe's implementation of Base85.

**Arguments:**
*   `alphabet` (Enum: [Standard, Z85 (ZeroMQ), IPv6]): Default: [object Object],[object Object],[object Object]
*   `include_delimeter` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_to_base85", "arguments": { "input": "..." } }
```

---

#### From Base85 (`cyberchef_from_base85`)
Base85 (also called Ascii85) is a notation for encoding arbitrary byte data. It is usually more efficient that Base64.

This operation decodes data from an ASCII string (with an alphabet of your choosing, presets included).

e.g. BOu!rD]j7BEbo7 becomes hello world

Base85 is commonly used in Adobe's PostScript and PDF file formats.

**Arguments:**
*   `alphabet` (Enum: [Standard, Z85 (ZeroMQ), IPv6]): Default: [object Object],[object Object],[object Object]
*   `remove_non-alphabet_chars` (boolean): Default: true
*   `all-zero_group_char` (binaryShortString): Default: z

**Example:**
```json
{ "name": "cyberchef_from_base85", "arguments": { "input": "..." } }
```

---

#### To Base (`cyberchef_to_base`)
Converts a decimal number to a given numerical base.

**Arguments:**
*   `radix` (number): Default: 36

**Example:**
```json
{ "name": "cyberchef_to_base", "arguments": { "input": "..." } }
```

---

#### From Base (`cyberchef_from_base`)
Converts a number to decimal from a given numerical base.

**Arguments:**
*   `radix` (number): Default: 36

**Example:**
```json
{ "name": "cyberchef_from_base", "arguments": { "input": "..." } }
```

---

#### To BCD (`cyberchef_to_bcd`)
Binary-Coded Decimal (BCD) is a class of binary encodings of decimal numbers where each decimal digit is represented by a fixed number of bits, usually four or eight. Special bit patterns are sometimes used for a sign

**Arguments:**
*   `scheme` (Enum: [8 4 2 1, 7 4 2 1, 4 2 2 1, 2 4 2 1, 8 4 -2 -1, ...]): Default: 8 4 2 1,7 4 2 1,4 2 2 1,2 4 2 1,8 4 -2 -1,Excess-3,IBM 8 4 2 1
*   `packed` (boolean): Default: true
*   `signed` (boolean): Default: false
*   `output_format` (Enum: [Nibbles, Bytes, Raw]): Default: Nibbles,Bytes,Raw

**Example:**
```json
{ "name": "cyberchef_to_bcd", "arguments": { "input": "..." } }
```

---

#### From BCD (`cyberchef_from_bcd`)
Binary-Coded Decimal (BCD) is a class of binary encodings of decimal numbers where each decimal digit is represented by a fixed number of bits, usually four or eight. Special bit patterns are sometimes used for a sign.

**Arguments:**
*   `scheme` (Enum: [8 4 2 1, 7 4 2 1, 4 2 2 1, 2 4 2 1, 8 4 -2 -1, ...]): Default: 8 4 2 1,7 4 2 1,4 2 2 1,2 4 2 1,8 4 -2 -1,Excess-3,IBM 8 4 2 1
*   `packed` (boolean): Default: true
*   `signed` (boolean): Default: false
*   `input_format` (Enum: [Nibbles, Bytes, Raw]): Default: Nibbles,Bytes,Raw

**Example:**
```json
{ "name": "cyberchef_from_bcd", "arguments": { "input": "..." } }
```

---

#### To HTML Entity (`cyberchef_to_html_entity`)
Converts characters to HTML entities

e.g. &amp; becomes &amp;amp;

**Arguments:**
*   `convert_all_characters` (boolean): Default: false
*   `convert_to` (Enum: [Named entities, Numeric entities, Hex entities]): Default: Named entities,Numeric entities,Hex entities

**Example:**
```json
{ "name": "cyberchef_to_html_entity", "arguments": { "input": "..." } }
```

---

#### From HTML Entity (`cyberchef_from_html_entity`)
Converts HTML entities back to characters

e.g. &amp;amp; becomes &amp;

**Example:**
```json
{ "name": "cyberchef_from_html_entity", "arguments": { "input": "..." } }
```

---

#### URL Encode (`cyberchef_url_encode`)
Encodes problematic characters into percent-encoding, a format supported by URIs/URLs.

e.g. = becomes %3d

**Arguments:**
*   `encode_all_special_chars` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_url_encode", "arguments": { "input": "..." } }
```

---

#### URL Decode (`cyberchef_url_decode`)
Converts URI/URL percent-encoded characters back to their raw values.

e.g. %3d becomes =

**Arguments:**
*   `treat_"+"_as_space` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_url_decode", "arguments": { "input": "..." } }
```

---

#### Escape Unicode Characters (`cyberchef_escape_unicode_characters`)
Converts characters to their unicode-escaped notations.

Supports the prefixes:\u%uU+e.g. σου becomes \u03C3\u03BF\u03C5

**Arguments:**
*   `prefix` (Enum: [\u, %u, U+]): Default: \u,%u,U+
*   `encode_all_chars` (boolean): Default: false
*   `padding` (number): Default: 4
*   `uppercase_hex` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_escape_unicode_characters", "arguments": { "input": "..." } }
```

---

#### Unescape Unicode Characters (`cyberchef_unescape_unicode_characters`)
Converts unicode-escaped character notation back into raw characters.

Supports the prefixes:\u%uU+e.g. \u03c3\u03bf\u03c5 becomes σου

**Arguments:**
*   `prefix` (Enum: [\u, %u, U+]): Default: \u,%u,U+

**Example:**
```json
{ "name": "cyberchef_unescape_unicode_characters", "arguments": { "input": "..." } }
```

---

#### Normalise Unicode (`cyberchef_normalise_unicode`)
Transform Unicode characters to one of the Normalisation Forms

**Arguments:**
*   `normal_form` (Enum: [NFD, NFC, NFKD, NFKC]): Default: NFD,NFC,NFKD,NFKC

**Example:**
```json
{ "name": "cyberchef_normalise_unicode", "arguments": { "input": "..." } }
```

---

#### To Quoted Printable (`cyberchef_to_quoted_printable`)
Quoted-Printable, or QP encoding, is an encoding using printable ASCII characters (alphanumeric and the equals sign '=') to transmit 8-bit data over a 7-bit data path or, generally, over a medium which is not 8-bit clean. It is defined as a MIME content transfer encoding for use in e-mail.

QP works by using the equals sign '=' as an escape character. It also limits line length to 76, as some software has limits on line length.

**Example:**
```json
{ "name": "cyberchef_to_quoted_printable", "arguments": { "input": "..." } }
```

---

#### From Quoted Printable (`cyberchef_from_quoted_printable`)
Converts QP-encoded text back to standard text.

e.g. The quoted-printable encoded string hello=20world becomes hello world

**Example:**
```json
{ "name": "cyberchef_from_quoted_printable", "arguments": { "input": "..." } }
```

---

#### To Punycode (`cyberchef_to_punycode`)
Punycode is a way to represent Unicode with the limited character subset of ASCII supported by the Domain Name System.

e.g. münchen encodes to mnchen-3ya

**Arguments:**
*   `internationalised_domain_name` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_to_punycode", "arguments": { "input": "..." } }
```

---

#### From Punycode (`cyberchef_from_punycode`)
Punycode is a way to represent Unicode with the limited character subset of ASCII supported by the Domain Name System.

e.g. mnchen-3ya decodes to münchen

**Arguments:**
*   `internationalised_domain_name` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_from_punycode", "arguments": { "input": "..." } }
```

---

#### AMF Encode (`cyberchef_amf_encode`)
Action Message Format (AMF) is a binary format used to serialize object graphs such as ActionScript objects and XML, or send messages between an Adobe Flash client and a remote service, usually a Flash Media Server or third party alternatives.

**Arguments:**
*   `format` (Enum: [AMF0, AMF3]): Default: AMF0,AMF3

**Example:**
```json
{ "name": "cyberchef_amf_encode", "arguments": { "input": "..." } }
```

---

#### AMF Decode (`cyberchef_amf_decode`)
Action Message Format (AMF) is a binary format used to serialize object graphs such as ActionScript objects and XML, or send messages between an Adobe Flash client and a remote service, usually a Flash Media Server or third party alternatives.

**Arguments:**
*   `format` (Enum: [AMF0, AMF3]): Default: AMF0,AMF3

**Example:**
```json
{ "name": "cyberchef_amf_decode", "arguments": { "input": "..." } }
```

---

#### To Hex Content (`cyberchef_to_hex_content`)
Converts special characters in a string to hexadecimal. This format is used by SNORT for representing hex within ASCII text.

e.g. foo=bar becomes foo|3d|bar.

**Arguments:**
*   `convert` (Enum: [Only special chars, Only special chars including spaces, All chars]): Default: Only special chars,Only special chars including spaces,All chars
*   `print_spaces_between_bytes` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_to_hex_content", "arguments": { "input": "..." } }
```

---

#### From Hex Content (`cyberchef_from_hex_content`)
Translates hexadecimal bytes in text back to raw bytes. This format is used by SNORT for representing hex within ASCII text.

e.g. foo|3d|bar becomes foo=bar.

**Example:**
```json
{ "name": "cyberchef_from_hex_content", "arguments": { "input": "..." } }
```

---

#### PEM to Hex (`cyberchef_pem_to_hex`)
Converts PEM (Privacy Enhanced Mail) format to a hexadecimal DER (Distinguished Encoding Rules) string.

**Example:**
```json
{ "name": "cyberchef_pem_to_hex", "arguments": { "input": "..." } }
```

---

#### Hex to PEM (`cyberchef_hex_to_pem`)
Converts a hexadecimal DER (Distinguished Encoding Rules) string into PEM (Privacy Enhanced Mail) format.

**Arguments:**
*   `header_string` (string): Default: CERTIFICATE

**Example:**
```json
{ "name": "cyberchef_hex_to_pem", "arguments": { "input": "..." } }
```

---

#### Parse ASN.1 hex string (`cyberchef_parse_asn_1_hex_string`)
Abstract Syntax Notation One (ASN.1) is a standard and notation that describes rules and structures for representing, encoding, transmitting, and decoding data in telecommunications and computer networking.

This operation parses arbitrary ASN.1 data (encoded as an hex string: use the 'To Hex' operation if necessary) and presents the resulting tree.

**Arguments:**
*   `starting_index` (number): Default: 0
*   `truncate_octet_strings_longer_than` (number): Default: 32

**Example:**
```json
{ "name": "cyberchef_parse_asn_1_hex_string", "arguments": { "input": "..." } }
```

---

#### Change IP format (`cyberchef_change_ip_format`)
Convert an IP address from one format to another, e.g. 172.20.23.54 to ac141736

**Arguments:**
*   `input_format` (Enum: [Dotted Decimal, Decimal, Octal, Hex]): Default: Dotted Decimal,Decimal,Octal,Hex
*   `output_format` (Enum: [Dotted Decimal, Decimal, Octal, Hex]): Default: Dotted Decimal,Decimal,Octal,Hex

**Example:**
```json
{ "name": "cyberchef_change_ip_format", "arguments": { "input": "..." } }
```

---

#### Encode text (`cyberchef_encode_text`)
Encodes text into the chosen character encoding.



Supported charsets are:

UTF-8 (65001)
UTF-7 (65000)
UTF-16LE (1200)
UTF-16BE (1201)
UTF-32LE (12000)
UTF-32BE (12001)
IBM EBCDIC International (500)
IBM EBCDIC US-Canada (37)
IBM EBCDIC Multilingual/ROECE (Latin 2) (870)
IBM EBCDIC Greek Modern (875)
IBM EBCDIC French (1010)
IBM EBCDIC Turkish (Latin 5) (1026)
IBM EBCDIC Latin 1/Open System (1047)
IBM EBCDIC Lao (1132/1133/1341)
IBM EBCDIC US-Canada (037 + Euro symbol) (1140)
IBM EBCDIC Germany (20273 + Euro symbol) (1141)
IBM EBCDIC Denmark-Norway (20277 + Euro symbol) (1142)
IBM EBCDIC Finland-Sweden (20278 + Euro symbol) (1143)
IBM EBCDIC Italy (20280 + Euro symbol) (1144)
IBM EBCDIC Latin America-Spain (20284 + Euro symbol) (1145)
IBM EBCDIC United Kingdom (20285 + Euro symbol) (1146)
IBM EBCDIC France (20297 + Euro symbol) (1147)
IBM EBCDIC International (500 + Euro symbol) (1148)
IBM EBCDIC Icelandic (20871 + Euro symbol) (1149)
IBM EBCDIC Germany (20273)
IBM EBCDIC Denmark-Norway (20277)
IBM EBCDIC Finland-Sweden (20278)
IBM EBCDIC Italy (20280)
IBM EBCDIC Latin America-Spain (20284)
IBM EBCDIC United Kingdom (20285)
IBM EBCDIC Japanese Katakana Extended (20290)
IBM EBCDIC France (20297)
IBM EBCDIC Arabic (20420)
IBM EBCDIC Greek (20423)
IBM EBCDIC Hebrew (20424)
IBM EBCDIC Korean Extended (20833)
IBM EBCDIC Thai (20838)
IBM EBCDIC Icelandic (20871)
IBM EBCDIC Cyrillic Russian (20880)
IBM EBCDIC Turkish (20905)
IBM EBCDIC Latin 1/Open System (1047 + Euro symbol) (20924)
IBM EBCDIC Cyrillic Serbian-Bulgarian (21025)
OEM United States (437)
OEM Greek (formerly 437G); Greek (DOS) (737)
OEM Baltic; Baltic (DOS) (775)
OEM Russian; Cyrillic + Euro symbol (808)
OEM Multilingual Latin 1; Western European (DOS) (850)
OEM Latin 2; Central European (DOS) (852)
OEM Cyrillic (primarily Russian) (855)
OEM Turkish; Turkish (DOS) (857)
OEM Multilingual Latin 1 + Euro symbol (858)
OEM Portuguese; Portuguese (DOS) (860)
OEM Icelandic; Icelandic (DOS) (861)
OEM Hebrew; Hebrew (DOS) (862)
OEM French Canadian; French Canadian (DOS) (863)
OEM Arabic; Arabic (864) (864)
OEM Nordic; Nordic (DOS) (865)
OEM Russian; Cyrillic (DOS) (866)
OEM Modern Greek; Greek, Modern (DOS) (869)
OEM Cyrillic (primarily Russian) + Euro Symbol (872)
Windows-874 Thai (874)
Windows-1250 Central European (1250)
Windows-1251 Cyrillic (1251)
Windows-1252 Latin (1252)
Windows-1253 Greek (1253)
Windows-1254 Turkish (1254)
Windows-1255 Hebrew (1255)
Windows-1256 Arabic (1256)
Windows-1257 Baltic (1257)
Windows-1258 Vietnam (1258)
ISO-8859-1 Latin 1 Western European (28591)
ISO-8859-2 Latin 2 Central European (28592)
ISO-8859-3 Latin 3 South European (28593)
ISO-8859-4 Latin 4 North European (28594)
ISO-8859-5 Latin/Cyrillic (28595)
ISO-8859-6 Latin/Arabic (28596)
ISO-8859-7 Latin/Greek (28597)
ISO-8859-8 Latin/Hebrew (28598)
ISO 8859-8 Hebrew (ISO-Logical) (38598)
ISO-8859-9 Latin 5 Turkish (28599)
ISO-8859-10 Latin 6 Nordic (28600)
ISO-8859-11 Latin/Thai (28601)
ISO-8859-13 Latin 7 Baltic Rim (28603)
ISO-8859-14 Latin 8 Celtic (28604)
ISO-8859-15 Latin 9 (28605)
ISO-8859-16 Latin 10 (28606)
ISO 2022 JIS Japanese with no halfwidth Katakana (50220)
ISO 2022 JIS Japanese with halfwidth Katakana (50221)
ISO 2022 Japanese JIS X 0201-1989 (1 byte Kana-SO/SI) (50222)
ISO 2022 Korean (50225)
ISO 2022 Simplified Chinese (50227)
ISO 6937 Non-Spacing Accent (20269)
EUC Japanese (51932)
EUC Simplified Chinese (51936)
EUC Korean (51949)
ISCII Devanagari (57002)
ISCII Bengali (57003)
ISCII Tamil (57004)
ISCII Telugu (57005)
ISCII Assamese (57006)
ISCII Oriya (57007)
ISCII Kannada (57008)
ISCII Malayalam (57009)
ISCII Gujarati (57010)
ISCII Punjabi (57011)
Japanese Shift-JIS (932)
Simplified Chinese GBK (936)
Korean (949)
Traditional Chinese Big5 (950)
US-ASCII (7-bit) (20127)
Simplified Chinese GB2312 (20936)
KOI8-R Russian Cyrillic (20866)
KOI8-U Ukrainian Cyrillic (21866)
Mazovia (Polish) MS-DOS (620)
Arabic (ASMO 708) (708)
Arabic (Transparent ASMO); Arabic (DOS) (720)
Kamenický (Czech) MS-DOS (895)
Korean (Johab) (1361)
MAC Roman (10000)
Japanese (Mac) (10001)
MAC Traditional Chinese (Big5) (10002)
Korean (Mac) (10003)
Arabic (Mac) (10004)
Hebrew (Mac) (10005)
Greek (Mac) (10006)
Cyrillic (Mac) (10007)
MAC Simplified Chinese (GB 2312) (10008)
Romanian (Mac) (10010)
Ukrainian (Mac) (10017)
Thai (Mac) (10021)
MAC Latin 2 (Central European) (10029)
Icelandic (Mac) (10079)
Turkish (Mac) (10081)
Croatian (Mac) (10082)
CNS Taiwan (Chinese Traditional) (20000)
TCA Taiwan (20001)
ETEN Taiwan (Chinese Traditional) (20002)
IBM5550 Taiwan (20003)
TeleText Taiwan (20004)
Wang Taiwan (20005)
Western European IA5 (IRV International Alphabet 5) (20105)
IA5 German (7-bit) (20106)
IA5 Swedish (7-bit) (20107)
IA5 Norwegian (7-bit) (20108)
T.61 (20261)
Japanese (JIS 0208-1990 and 0212-1990) (20932)
Korean Wansung (20949)
Extended/Ext Alpha Lowercase (21027)
Europa 3 (29001)
Atari ST/TT (47451)
HZ-GB2312 Simplified Chinese (52936)
Simplified Chinese GB18030 (54936)


**Arguments:**
*   `encoding` (Enum: [UTF-8 (65001), UTF-7 (65000), UTF-16LE (1200), UTF-16BE (1201), UTF-32LE (12000), ...]): Default: UTF-8 (65001),UTF-7 (65000),UTF-16LE (1200),UTF-16BE (1201),UTF-32LE (12000),UTF-32BE (12001),IBM EBCDIC International (500),IBM EBCDIC US-Canada (37),IBM EBCDIC Multilingual/ROECE (Latin 2) (870),IBM EBCDIC Greek Modern (875),IBM EBCDIC French (1010),IBM EBCDIC Turkish (Latin 5) (1026),IBM EBCDIC Latin 1/Open System (1047),IBM EBCDIC Lao (1132/1133/1341),IBM EBCDIC US-Canada (037 + Euro symbol) (1140),IBM EBCDIC Germany (20273 + Euro symbol) (1141),IBM EBCDIC Denmark-Norway (20277 + Euro symbol) (1142),IBM EBCDIC Finland-Sweden (20278 + Euro symbol) (1143),IBM EBCDIC Italy (20280 + Euro symbol) (1144),IBM EBCDIC Latin America-Spain (20284 + Euro symbol) (1145),IBM EBCDIC United Kingdom (20285 + Euro symbol) (1146),IBM EBCDIC France (20297 + Euro symbol) (1147),IBM EBCDIC International (500 + Euro symbol) (1148),IBM EBCDIC Icelandic (20871 + Euro symbol) (1149),IBM EBCDIC Germany (20273),IBM EBCDIC Denmark-Norway (20277),IBM EBCDIC Finland-Sweden (20278),IBM EBCDIC Italy (20280),IBM EBCDIC Latin America-Spain (20284),IBM EBCDIC United Kingdom (20285),IBM EBCDIC Japanese Katakana Extended (20290),IBM EBCDIC France (20297),IBM EBCDIC Arabic (20420),IBM EBCDIC Greek (20423),IBM EBCDIC Hebrew (20424),IBM EBCDIC Korean Extended (20833),IBM EBCDIC Thai (20838),IBM EBCDIC Icelandic (20871),IBM EBCDIC Cyrillic Russian (20880),IBM EBCDIC Turkish (20905),IBM EBCDIC Latin 1/Open System (1047 + Euro symbol) (20924),IBM EBCDIC Cyrillic Serbian-Bulgarian (21025),OEM United States (437),OEM Greek (formerly 437G); Greek (DOS) (737),OEM Baltic; Baltic (DOS) (775),OEM Russian; Cyrillic + Euro symbol (808),OEM Multilingual Latin 1; Western European (DOS) (850),OEM Latin 2; Central European (DOS) (852),OEM Cyrillic (primarily Russian) (855),OEM Turkish; Turkish (DOS) (857),OEM Multilingual Latin 1 + Euro symbol (858),OEM Portuguese; Portuguese (DOS) (860),OEM Icelandic; Icelandic (DOS) (861),OEM Hebrew; Hebrew (DOS) (862),OEM French Canadian; French Canadian (DOS) (863),OEM Arabic; Arabic (864) (864),OEM Nordic; Nordic (DOS) (865),OEM Russian; Cyrillic (DOS) (866),OEM Modern Greek; Greek, Modern (DOS) (869),OEM Cyrillic (primarily Russian) + Euro Symbol (872),Windows-874 Thai (874),Windows-1250 Central European (1250),Windows-1251 Cyrillic (1251),Windows-1252 Latin (1252),Windows-1253 Greek (1253),Windows-1254 Turkish (1254),Windows-1255 Hebrew (1255),Windows-1256 Arabic (1256),Windows-1257 Baltic (1257),Windows-1258 Vietnam (1258),ISO-8859-1 Latin 1 Western European (28591),ISO-8859-2 Latin 2 Central European (28592),ISO-8859-3 Latin 3 South European (28593),ISO-8859-4 Latin 4 North European (28594),ISO-8859-5 Latin/Cyrillic (28595),ISO-8859-6 Latin/Arabic (28596),ISO-8859-7 Latin/Greek (28597),ISO-8859-8 Latin/Hebrew (28598),ISO 8859-8 Hebrew (ISO-Logical) (38598),ISO-8859-9 Latin 5 Turkish (28599),ISO-8859-10 Latin 6 Nordic (28600),ISO-8859-11 Latin/Thai (28601),ISO-8859-13 Latin 7 Baltic Rim (28603),ISO-8859-14 Latin 8 Celtic (28604),ISO-8859-15 Latin 9 (28605),ISO-8859-16 Latin 10 (28606),ISO 2022 JIS Japanese with no halfwidth Katakana (50220),ISO 2022 JIS Japanese with halfwidth Katakana (50221),ISO 2022 Japanese JIS X 0201-1989 (1 byte Kana-SO/SI) (50222),ISO 2022 Korean (50225),ISO 2022 Simplified Chinese (50227),ISO 6937 Non-Spacing Accent (20269),EUC Japanese (51932),EUC Simplified Chinese (51936),EUC Korean (51949),ISCII Devanagari (57002),ISCII Bengali (57003),ISCII Tamil (57004),ISCII Telugu (57005),ISCII Assamese (57006),ISCII Oriya (57007),ISCII Kannada (57008),ISCII Malayalam (57009),ISCII Gujarati (57010),ISCII Punjabi (57011),Japanese Shift-JIS (932),Simplified Chinese GBK (936),Korean (949),Traditional Chinese Big5 (950),US-ASCII (7-bit) (20127),Simplified Chinese GB2312 (20936),KOI8-R Russian Cyrillic (20866),KOI8-U Ukrainian Cyrillic (21866),Mazovia (Polish) MS-DOS (620),Arabic (ASMO 708) (708),Arabic (Transparent ASMO); Arabic (DOS) (720),Kamenický (Czech) MS-DOS (895),Korean (Johab) (1361),MAC Roman (10000),Japanese (Mac) (10001),MAC Traditional Chinese (Big5) (10002),Korean (Mac) (10003),Arabic (Mac) (10004),Hebrew (Mac) (10005),Greek (Mac) (10006),Cyrillic (Mac) (10007),MAC Simplified Chinese (GB 2312) (10008),Romanian (Mac) (10010),Ukrainian (Mac) (10017),Thai (Mac) (10021),MAC Latin 2 (Central European) (10029),Icelandic (Mac) (10079),Turkish (Mac) (10081),Croatian (Mac) (10082),CNS Taiwan (Chinese Traditional) (20000),TCA Taiwan (20001),ETEN Taiwan (Chinese Traditional) (20002),IBM5550 Taiwan (20003),TeleText Taiwan (20004),Wang Taiwan (20005),Western European IA5 (IRV International Alphabet 5) (20105),IA5 German (7-bit) (20106),IA5 Swedish (7-bit) (20107),IA5 Norwegian (7-bit) (20108),T.61 (20261),Japanese (JIS 0208-1990 and 0212-1990) (20932),Korean Wansung (20949),Extended/Ext Alpha Lowercase (21027),Europa 3 (29001),Atari ST/TT (47451),HZ-GB2312 Simplified Chinese (52936),Simplified Chinese GB18030 (54936)

**Example:**
```json
{ "name": "cyberchef_encode_text", "arguments": { "input": "..." } }
```

---

#### Decode text (`cyberchef_decode_text`)
Decodes text from the chosen character encoding.



Supported charsets are:

UTF-8 (65001)
UTF-7 (65000)
UTF-16LE (1200)
UTF-16BE (1201)
UTF-32LE (12000)
UTF-32BE (12001)
IBM EBCDIC International (500)
IBM EBCDIC US-Canada (37)
IBM EBCDIC Multilingual/ROECE (Latin 2) (870)
IBM EBCDIC Greek Modern (875)
IBM EBCDIC French (1010)
IBM EBCDIC Turkish (Latin 5) (1026)
IBM EBCDIC Latin 1/Open System (1047)
IBM EBCDIC Lao (1132/1133/1341)
IBM EBCDIC US-Canada (037 + Euro symbol) (1140)
IBM EBCDIC Germany (20273 + Euro symbol) (1141)
IBM EBCDIC Denmark-Norway (20277 + Euro symbol) (1142)
IBM EBCDIC Finland-Sweden (20278 + Euro symbol) (1143)
IBM EBCDIC Italy (20280 + Euro symbol) (1144)
IBM EBCDIC Latin America-Spain (20284 + Euro symbol) (1145)
IBM EBCDIC United Kingdom (20285 + Euro symbol) (1146)
IBM EBCDIC France (20297 + Euro symbol) (1147)
IBM EBCDIC International (500 + Euro symbol) (1148)
IBM EBCDIC Icelandic (20871 + Euro symbol) (1149)
IBM EBCDIC Germany (20273)
IBM EBCDIC Denmark-Norway (20277)
IBM EBCDIC Finland-Sweden (20278)
IBM EBCDIC Italy (20280)
IBM EBCDIC Latin America-Spain (20284)
IBM EBCDIC United Kingdom (20285)
IBM EBCDIC Japanese Katakana Extended (20290)
IBM EBCDIC France (20297)
IBM EBCDIC Arabic (20420)
IBM EBCDIC Greek (20423)
IBM EBCDIC Hebrew (20424)
IBM EBCDIC Korean Extended (20833)
IBM EBCDIC Thai (20838)
IBM EBCDIC Icelandic (20871)
IBM EBCDIC Cyrillic Russian (20880)
IBM EBCDIC Turkish (20905)
IBM EBCDIC Latin 1/Open System (1047 + Euro symbol) (20924)
IBM EBCDIC Cyrillic Serbian-Bulgarian (21025)
OEM United States (437)
OEM Greek (formerly 437G); Greek (DOS) (737)
OEM Baltic; Baltic (DOS) (775)
OEM Russian; Cyrillic + Euro symbol (808)
OEM Multilingual Latin 1; Western European (DOS) (850)
OEM Latin 2; Central European (DOS) (852)
OEM Cyrillic (primarily Russian) (855)
OEM Turkish; Turkish (DOS) (857)
OEM Multilingual Latin 1 + Euro symbol (858)
OEM Portuguese; Portuguese (DOS) (860)
OEM Icelandic; Icelandic (DOS) (861)
OEM Hebrew; Hebrew (DOS) (862)
OEM French Canadian; French Canadian (DOS) (863)
OEM Arabic; Arabic (864) (864)
OEM Nordic; Nordic (DOS) (865)
OEM Russian; Cyrillic (DOS) (866)
OEM Modern Greek; Greek, Modern (DOS) (869)
OEM Cyrillic (primarily Russian) + Euro Symbol (872)
Windows-874 Thai (874)
Windows-1250 Central European (1250)
Windows-1251 Cyrillic (1251)
Windows-1252 Latin (1252)
Windows-1253 Greek (1253)
Windows-1254 Turkish (1254)
Windows-1255 Hebrew (1255)
Windows-1256 Arabic (1256)
Windows-1257 Baltic (1257)
Windows-1258 Vietnam (1258)
ISO-8859-1 Latin 1 Western European (28591)
ISO-8859-2 Latin 2 Central European (28592)
ISO-8859-3 Latin 3 South European (28593)
ISO-8859-4 Latin 4 North European (28594)
ISO-8859-5 Latin/Cyrillic (28595)
ISO-8859-6 Latin/Arabic (28596)
ISO-8859-7 Latin/Greek (28597)
ISO-8859-8 Latin/Hebrew (28598)
ISO 8859-8 Hebrew (ISO-Logical) (38598)
ISO-8859-9 Latin 5 Turkish (28599)
ISO-8859-10 Latin 6 Nordic (28600)
ISO-8859-11 Latin/Thai (28601)
ISO-8859-13 Latin 7 Baltic Rim (28603)
ISO-8859-14 Latin 8 Celtic (28604)
ISO-8859-15 Latin 9 (28605)
ISO-8859-16 Latin 10 (28606)
ISO 2022 JIS Japanese with no halfwidth Katakana (50220)
ISO 2022 JIS Japanese with halfwidth Katakana (50221)
ISO 2022 Japanese JIS X 0201-1989 (1 byte Kana-SO/SI) (50222)
ISO 2022 Korean (50225)
ISO 2022 Simplified Chinese (50227)
ISO 6937 Non-Spacing Accent (20269)
EUC Japanese (51932)
EUC Simplified Chinese (51936)
EUC Korean (51949)
ISCII Devanagari (57002)
ISCII Bengali (57003)
ISCII Tamil (57004)
ISCII Telugu (57005)
ISCII Assamese (57006)
ISCII Oriya (57007)
ISCII Kannada (57008)
ISCII Malayalam (57009)
ISCII Gujarati (57010)
ISCII Punjabi (57011)
Japanese Shift-JIS (932)
Simplified Chinese GBK (936)
Korean (949)
Traditional Chinese Big5 (950)
US-ASCII (7-bit) (20127)
Simplified Chinese GB2312 (20936)
KOI8-R Russian Cyrillic (20866)
KOI8-U Ukrainian Cyrillic (21866)
Mazovia (Polish) MS-DOS (620)
Arabic (ASMO 708) (708)
Arabic (Transparent ASMO); Arabic (DOS) (720)
Kamenický (Czech) MS-DOS (895)
Korean (Johab) (1361)
MAC Roman (10000)
Japanese (Mac) (10001)
MAC Traditional Chinese (Big5) (10002)
Korean (Mac) (10003)
Arabic (Mac) (10004)
Hebrew (Mac) (10005)
Greek (Mac) (10006)
Cyrillic (Mac) (10007)
MAC Simplified Chinese (GB 2312) (10008)
Romanian (Mac) (10010)
Ukrainian (Mac) (10017)
Thai (Mac) (10021)
MAC Latin 2 (Central European) (10029)
Icelandic (Mac) (10079)
Turkish (Mac) (10081)
Croatian (Mac) (10082)
CNS Taiwan (Chinese Traditional) (20000)
TCA Taiwan (20001)
ETEN Taiwan (Chinese Traditional) (20002)
IBM5550 Taiwan (20003)
TeleText Taiwan (20004)
Wang Taiwan (20005)
Western European IA5 (IRV International Alphabet 5) (20105)
IA5 German (7-bit) (20106)
IA5 Swedish (7-bit) (20107)
IA5 Norwegian (7-bit) (20108)
T.61 (20261)
Japanese (JIS 0208-1990 and 0212-1990) (20932)
Korean Wansung (20949)
Extended/Ext Alpha Lowercase (21027)
Europa 3 (29001)
Atari ST/TT (47451)
HZ-GB2312 Simplified Chinese (52936)
Simplified Chinese GB18030 (54936)


**Arguments:**
*   `encoding` (Enum: [UTF-8 (65001), UTF-7 (65000), UTF-16LE (1200), UTF-16BE (1201), UTF-32LE (12000), ...]): Default: UTF-8 (65001),UTF-7 (65000),UTF-16LE (1200),UTF-16BE (1201),UTF-32LE (12000),UTF-32BE (12001),IBM EBCDIC International (500),IBM EBCDIC US-Canada (37),IBM EBCDIC Multilingual/ROECE (Latin 2) (870),IBM EBCDIC Greek Modern (875),IBM EBCDIC French (1010),IBM EBCDIC Turkish (Latin 5) (1026),IBM EBCDIC Latin 1/Open System (1047),IBM EBCDIC Lao (1132/1133/1341),IBM EBCDIC US-Canada (037 + Euro symbol) (1140),IBM EBCDIC Germany (20273 + Euro symbol) (1141),IBM EBCDIC Denmark-Norway (20277 + Euro symbol) (1142),IBM EBCDIC Finland-Sweden (20278 + Euro symbol) (1143),IBM EBCDIC Italy (20280 + Euro symbol) (1144),IBM EBCDIC Latin America-Spain (20284 + Euro symbol) (1145),IBM EBCDIC United Kingdom (20285 + Euro symbol) (1146),IBM EBCDIC France (20297 + Euro symbol) (1147),IBM EBCDIC International (500 + Euro symbol) (1148),IBM EBCDIC Icelandic (20871 + Euro symbol) (1149),IBM EBCDIC Germany (20273),IBM EBCDIC Denmark-Norway (20277),IBM EBCDIC Finland-Sweden (20278),IBM EBCDIC Italy (20280),IBM EBCDIC Latin America-Spain (20284),IBM EBCDIC United Kingdom (20285),IBM EBCDIC Japanese Katakana Extended (20290),IBM EBCDIC France (20297),IBM EBCDIC Arabic (20420),IBM EBCDIC Greek (20423),IBM EBCDIC Hebrew (20424),IBM EBCDIC Korean Extended (20833),IBM EBCDIC Thai (20838),IBM EBCDIC Icelandic (20871),IBM EBCDIC Cyrillic Russian (20880),IBM EBCDIC Turkish (20905),IBM EBCDIC Latin 1/Open System (1047 + Euro symbol) (20924),IBM EBCDIC Cyrillic Serbian-Bulgarian (21025),OEM United States (437),OEM Greek (formerly 437G); Greek (DOS) (737),OEM Baltic; Baltic (DOS) (775),OEM Russian; Cyrillic + Euro symbol (808),OEM Multilingual Latin 1; Western European (DOS) (850),OEM Latin 2; Central European (DOS) (852),OEM Cyrillic (primarily Russian) (855),OEM Turkish; Turkish (DOS) (857),OEM Multilingual Latin 1 + Euro symbol (858),OEM Portuguese; Portuguese (DOS) (860),OEM Icelandic; Icelandic (DOS) (861),OEM Hebrew; Hebrew (DOS) (862),OEM French Canadian; French Canadian (DOS) (863),OEM Arabic; Arabic (864) (864),OEM Nordic; Nordic (DOS) (865),OEM Russian; Cyrillic (DOS) (866),OEM Modern Greek; Greek, Modern (DOS) (869),OEM Cyrillic (primarily Russian) + Euro Symbol (872),Windows-874 Thai (874),Windows-1250 Central European (1250),Windows-1251 Cyrillic (1251),Windows-1252 Latin (1252),Windows-1253 Greek (1253),Windows-1254 Turkish (1254),Windows-1255 Hebrew (1255),Windows-1256 Arabic (1256),Windows-1257 Baltic (1257),Windows-1258 Vietnam (1258),ISO-8859-1 Latin 1 Western European (28591),ISO-8859-2 Latin 2 Central European (28592),ISO-8859-3 Latin 3 South European (28593),ISO-8859-4 Latin 4 North European (28594),ISO-8859-5 Latin/Cyrillic (28595),ISO-8859-6 Latin/Arabic (28596),ISO-8859-7 Latin/Greek (28597),ISO-8859-8 Latin/Hebrew (28598),ISO 8859-8 Hebrew (ISO-Logical) (38598),ISO-8859-9 Latin 5 Turkish (28599),ISO-8859-10 Latin 6 Nordic (28600),ISO-8859-11 Latin/Thai (28601),ISO-8859-13 Latin 7 Baltic Rim (28603),ISO-8859-14 Latin 8 Celtic (28604),ISO-8859-15 Latin 9 (28605),ISO-8859-16 Latin 10 (28606),ISO 2022 JIS Japanese with no halfwidth Katakana (50220),ISO 2022 JIS Japanese with halfwidth Katakana (50221),ISO 2022 Japanese JIS X 0201-1989 (1 byte Kana-SO/SI) (50222),ISO 2022 Korean (50225),ISO 2022 Simplified Chinese (50227),ISO 6937 Non-Spacing Accent (20269),EUC Japanese (51932),EUC Simplified Chinese (51936),EUC Korean (51949),ISCII Devanagari (57002),ISCII Bengali (57003),ISCII Tamil (57004),ISCII Telugu (57005),ISCII Assamese (57006),ISCII Oriya (57007),ISCII Kannada (57008),ISCII Malayalam (57009),ISCII Gujarati (57010),ISCII Punjabi (57011),Japanese Shift-JIS (932),Simplified Chinese GBK (936),Korean (949),Traditional Chinese Big5 (950),US-ASCII (7-bit) (20127),Simplified Chinese GB2312 (20936),KOI8-R Russian Cyrillic (20866),KOI8-U Ukrainian Cyrillic (21866),Mazovia (Polish) MS-DOS (620),Arabic (ASMO 708) (708),Arabic (Transparent ASMO); Arabic (DOS) (720),Kamenický (Czech) MS-DOS (895),Korean (Johab) (1361),MAC Roman (10000),Japanese (Mac) (10001),MAC Traditional Chinese (Big5) (10002),Korean (Mac) (10003),Arabic (Mac) (10004),Hebrew (Mac) (10005),Greek (Mac) (10006),Cyrillic (Mac) (10007),MAC Simplified Chinese (GB 2312) (10008),Romanian (Mac) (10010),Ukrainian (Mac) (10017),Thai (Mac) (10021),MAC Latin 2 (Central European) (10029),Icelandic (Mac) (10079),Turkish (Mac) (10081),Croatian (Mac) (10082),CNS Taiwan (Chinese Traditional) (20000),TCA Taiwan (20001),ETEN Taiwan (Chinese Traditional) (20002),IBM5550 Taiwan (20003),TeleText Taiwan (20004),Wang Taiwan (20005),Western European IA5 (IRV International Alphabet 5) (20105),IA5 German (7-bit) (20106),IA5 Swedish (7-bit) (20107),IA5 Norwegian (7-bit) (20108),T.61 (20261),Japanese (JIS 0208-1990 and 0212-1990) (20932),Korean Wansung (20949),Extended/Ext Alpha Lowercase (21027),Europa 3 (29001),Atari ST/TT (47451),HZ-GB2312 Simplified Chinese (52936),Simplified Chinese GB18030 (54936)

**Example:**
```json
{ "name": "cyberchef_decode_text", "arguments": { "input": "..." } }
```

---

#### Text Encoding Brute Force (`cyberchef_text_encoding_brute_force`)
Enumerates all supported text encodings for the input, allowing you to quickly spot the correct one.



Supported charsets are:

UTF-8 (65001)
UTF-7 (65000)
UTF-16LE (1200)
UTF-16BE (1201)
UTF-32LE (12000)
UTF-32BE (12001)
IBM EBCDIC International (500)
IBM EBCDIC US-Canada (37)
IBM EBCDIC Multilingual/ROECE (Latin 2) (870)
IBM EBCDIC Greek Modern (875)
IBM EBCDIC French (1010)
IBM EBCDIC Turkish (Latin 5) (1026)
IBM EBCDIC Latin 1/Open System (1047)
IBM EBCDIC Lao (1132/1133/1341)
IBM EBCDIC US-Canada (037 + Euro symbol) (1140)
IBM EBCDIC Germany (20273 + Euro symbol) (1141)
IBM EBCDIC Denmark-Norway (20277 + Euro symbol) (1142)
IBM EBCDIC Finland-Sweden (20278 + Euro symbol) (1143)
IBM EBCDIC Italy (20280 + Euro symbol) (1144)
IBM EBCDIC Latin America-Spain (20284 + Euro symbol) (1145)
IBM EBCDIC United Kingdom (20285 + Euro symbol) (1146)
IBM EBCDIC France (20297 + Euro symbol) (1147)
IBM EBCDIC International (500 + Euro symbol) (1148)
IBM EBCDIC Icelandic (20871 + Euro symbol) (1149)
IBM EBCDIC Germany (20273)
IBM EBCDIC Denmark-Norway (20277)
IBM EBCDIC Finland-Sweden (20278)
IBM EBCDIC Italy (20280)
IBM EBCDIC Latin America-Spain (20284)
IBM EBCDIC United Kingdom (20285)
IBM EBCDIC Japanese Katakana Extended (20290)
IBM EBCDIC France (20297)
IBM EBCDIC Arabic (20420)
IBM EBCDIC Greek (20423)
IBM EBCDIC Hebrew (20424)
IBM EBCDIC Korean Extended (20833)
IBM EBCDIC Thai (20838)
IBM EBCDIC Icelandic (20871)
IBM EBCDIC Cyrillic Russian (20880)
IBM EBCDIC Turkish (20905)
IBM EBCDIC Latin 1/Open System (1047 + Euro symbol) (20924)
IBM EBCDIC Cyrillic Serbian-Bulgarian (21025)
OEM United States (437)
OEM Greek (formerly 437G); Greek (DOS) (737)
OEM Baltic; Baltic (DOS) (775)
OEM Russian; Cyrillic + Euro symbol (808)
OEM Multilingual Latin 1; Western European (DOS) (850)
OEM Latin 2; Central European (DOS) (852)
OEM Cyrillic (primarily Russian) (855)
OEM Turkish; Turkish (DOS) (857)
OEM Multilingual Latin 1 + Euro symbol (858)
OEM Portuguese; Portuguese (DOS) (860)
OEM Icelandic; Icelandic (DOS) (861)
OEM Hebrew; Hebrew (DOS) (862)
OEM French Canadian; French Canadian (DOS) (863)
OEM Arabic; Arabic (864) (864)
OEM Nordic; Nordic (DOS) (865)
OEM Russian; Cyrillic (DOS) (866)
OEM Modern Greek; Greek, Modern (DOS) (869)
OEM Cyrillic (primarily Russian) + Euro Symbol (872)
Windows-874 Thai (874)
Windows-1250 Central European (1250)
Windows-1251 Cyrillic (1251)
Windows-1252 Latin (1252)
Windows-1253 Greek (1253)
Windows-1254 Turkish (1254)
Windows-1255 Hebrew (1255)
Windows-1256 Arabic (1256)
Windows-1257 Baltic (1257)
Windows-1258 Vietnam (1258)
ISO-8859-1 Latin 1 Western European (28591)
ISO-8859-2 Latin 2 Central European (28592)
ISO-8859-3 Latin 3 South European (28593)
ISO-8859-4 Latin 4 North European (28594)
ISO-8859-5 Latin/Cyrillic (28595)
ISO-8859-6 Latin/Arabic (28596)
ISO-8859-7 Latin/Greek (28597)
ISO-8859-8 Latin/Hebrew (28598)
ISO 8859-8 Hebrew (ISO-Logical) (38598)
ISO-8859-9 Latin 5 Turkish (28599)
ISO-8859-10 Latin 6 Nordic (28600)
ISO-8859-11 Latin/Thai (28601)
ISO-8859-13 Latin 7 Baltic Rim (28603)
ISO-8859-14 Latin 8 Celtic (28604)
ISO-8859-15 Latin 9 (28605)
ISO-8859-16 Latin 10 (28606)
ISO 2022 JIS Japanese with no halfwidth Katakana (50220)
ISO 2022 JIS Japanese with halfwidth Katakana (50221)
ISO 2022 Japanese JIS X 0201-1989 (1 byte Kana-SO/SI) (50222)
ISO 2022 Korean (50225)
ISO 2022 Simplified Chinese (50227)
ISO 6937 Non-Spacing Accent (20269)
EUC Japanese (51932)
EUC Simplified Chinese (51936)
EUC Korean (51949)
ISCII Devanagari (57002)
ISCII Bengali (57003)
ISCII Tamil (57004)
ISCII Telugu (57005)
ISCII Assamese (57006)
ISCII Oriya (57007)
ISCII Kannada (57008)
ISCII Malayalam (57009)
ISCII Gujarati (57010)
ISCII Punjabi (57011)
Japanese Shift-JIS (932)
Simplified Chinese GBK (936)
Korean (949)
Traditional Chinese Big5 (950)
US-ASCII (7-bit) (20127)
Simplified Chinese GB2312 (20936)
KOI8-R Russian Cyrillic (20866)
KOI8-U Ukrainian Cyrillic (21866)
Mazovia (Polish) MS-DOS (620)
Arabic (ASMO 708) (708)
Arabic (Transparent ASMO); Arabic (DOS) (720)
Kamenický (Czech) MS-DOS (895)
Korean (Johab) (1361)
MAC Roman (10000)
Japanese (Mac) (10001)
MAC Traditional Chinese (Big5) (10002)
Korean (Mac) (10003)
Arabic (Mac) (10004)
Hebrew (Mac) (10005)
Greek (Mac) (10006)
Cyrillic (Mac) (10007)
MAC Simplified Chinese (GB 2312) (10008)
Romanian (Mac) (10010)
Ukrainian (Mac) (10017)
Thai (Mac) (10021)
MAC Latin 2 (Central European) (10029)
Icelandic (Mac) (10079)
Turkish (Mac) (10081)
Croatian (Mac) (10082)
CNS Taiwan (Chinese Traditional) (20000)
TCA Taiwan (20001)
ETEN Taiwan (Chinese Traditional) (20002)
IBM5550 Taiwan (20003)
TeleText Taiwan (20004)
Wang Taiwan (20005)
Western European IA5 (IRV International Alphabet 5) (20105)
IA5 German (7-bit) (20106)
IA5 Swedish (7-bit) (20107)
IA5 Norwegian (7-bit) (20108)
T.61 (20261)
Japanese (JIS 0208-1990 and 0212-1990) (20932)
Korean Wansung (20949)
Extended/Ext Alpha Lowercase (21027)
Europa 3 (29001)
Atari ST/TT (47451)
HZ-GB2312 Simplified Chinese (52936)
Simplified Chinese GB18030 (54936)


**Arguments:**
*   `mode` (Enum: [Encode, Decode]): Default: Encode,Decode

**Example:**
```json
{ "name": "cyberchef_text_encoding_brute_force", "arguments": { "input": "..." } }
```

---

#### Swap endianness (`cyberchef_swap_endianness`)
Switches the data from big-endian to little-endian or vice-versa. Data can be read in as hexadecimal or raw bytes. It will be returned in the same format as it is entered.

**Arguments:**
*   `data_format` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `word_length_(bytes)` (number): Default: 4
*   `pad_incomplete_words` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_swap_endianness", "arguments": { "input": "..." } }
```

---

#### To MessagePack (`cyberchef_to_messagepack`)
Converts JSON to MessagePack encoded byte buffer. MessagePack is a computer data interchange format. It is a binary form for representing simple data structures like arrays and associative arrays.

**Example:**
```json
{ "name": "cyberchef_to_messagepack", "arguments": { "input": "..." } }
```

---

#### From MessagePack (`cyberchef_from_messagepack`)
Converts MessagePack encoded data to JSON. MessagePack is a computer data interchange format. It is a binary form for representing simple data structures like arrays and associative arrays.

**Example:**
```json
{ "name": "cyberchef_from_messagepack", "arguments": { "input": "..." } }
```

---

#### To Braille (`cyberchef_to_braille`)
Converts text to six-dot braille symbols.

**Example:**
```json
{ "name": "cyberchef_to_braille", "arguments": { "input": "..." } }
```

---

#### From Braille (`cyberchef_from_braille`)
Converts six-dot braille symbols to text.

**Example:**
```json
{ "name": "cyberchef_from_braille", "arguments": { "input": "..." } }
```

---

#### Parse TLV (`cyberchef_parse_tlv`)
Converts a Type-Length-Value (TLV) encoded string into a JSON object.  Can optionally include a Key / Type entry. 

Tags: Key-Length-Value, KLV, Length-Value, LV

**Arguments:**
*   `type/key_size` (number): Default: 1
*   `length_size` (number): Default: 1
*   `use_ber` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_parse_tlv", "arguments": { "input": "..." } }
```

---

#### CSV to JSON (`cyberchef_csv_to_json`)
Converts a CSV file to JSON format.

**Arguments:**
*   `cell_delimiters` (binaryShortString): Default: ,
*   `row_delimiters` (binaryShortString): Default: \r\n
*   `format` (Enum: [Array of dictionaries, Array of arrays]): Default: Array of dictionaries,Array of arrays

**Example:**
```json
{ "name": "cyberchef_csv_to_json", "arguments": { "input": "..." } }
```

---

#### JSON to CSV (`cyberchef_json_to_csv`)
Converts JSON data to a CSV based on the definition in RFC 4180.

**Arguments:**
*   `cell_delimiter` (binaryShortString): Default: ,
*   `row_delimiter` (binaryShortString): Default: \r\n

**Example:**
```json
{ "name": "cyberchef_json_to_csv", "arguments": { "input": "..." } }
```

---

#### Avro to JSON (`cyberchef_avro_to_json`)
Converts Avro encoded data into JSON.

**Arguments:**
*   `force_valid_json` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_avro_to_json", "arguments": { "input": "..." } }
```

---

#### CBOR Encode (`cyberchef_cbor_encode`)
Concise Binary Object Representation (CBOR) is a binary data serialization format loosely based on JSON. Like JSON it allows the transmission of data objects that contain name–value pairs, but in a more concise manner. This increases processing and transfer speeds at the cost of human readability. It is defined in IETF RFC 8949.

**Example:**
```json
{ "name": "cyberchef_cbor_encode", "arguments": { "input": "..." } }
```

---

#### CBOR Decode (`cyberchef_cbor_decode`)
Concise Binary Object Representation (CBOR) is a binary data serialization format loosely based on JSON. Like JSON it allows the transmission of data objects that contain name–value pairs, but in a more concise manner. This increases processing and transfer speeds at the cost of human readability. It is defined in IETF RFC 8949.

**Example:**
```json
{ "name": "cyberchef_cbor_decode", "arguments": { "input": "..." } }
```

---

#### YAML to JSON (`cyberchef_yaml_to_json`)
Convert YAML to JSON

**Example:**
```json
{ "name": "cyberchef_yaml_to_json", "arguments": { "input": "..." } }
```

---

#### JSON to YAML (`cyberchef_json_to_yaml`)
Format a JSON object into YAML

**Example:**
```json
{ "name": "cyberchef_json_to_yaml", "arguments": { "input": "..." } }
```

---

#### Caret/M-decode (`cyberchef_caret_m_decode`)
Decodes caret or M-encoded strings, i.e. ^M turns into a newline, M-^] turns into 0x9d. Sources such as `cat -v`.

Please be aware that when using `cat -v` ^_ (caret-underscore) will not be encoded, but represents a valid encoding (namely that of 0x1f).

**Example:**
```json
{ "name": "cyberchef_caret_m_decode", "arguments": { "input": "..." } }
```

---

#### Rison Encode (`cyberchef_rison_encode`)
Rison, a data serialization format optimized for compactness in URIs. Rison is a slight variation of JSON that looks vastly superior after URI encoding. Rison still expresses exactly the same set of data structures as JSON, so data can be translated back and forth without loss or guesswork.

**Arguments:**
*   `encode_option` (Enum: [Encode, Encode Object, Encode Array, Encode URI]): Default: Encode,Encode Object,Encode Array,Encode URI

**Example:**
```json
{ "name": "cyberchef_rison_encode", "arguments": { "input": "..." } }
```

---

#### Rison Decode (`cyberchef_rison_decode`)
Rison, a data serialization format optimized for compactness in URIs. Rison is a slight variation of JSON that looks vastly superior after URI encoding. Rison still expresses exactly the same set of data structures as JSON, so data can be translated back and forth without loss or guesswork.

**Arguments:**
*   `decode_option` (Enum: [Decode, Decode Object, Decode Array]): Default: Decode,Decode Object,Decode Array

**Example:**
```json
{ "name": "cyberchef_rison_decode", "arguments": { "input": "..." } }
```

---

#### To Modhex (`cyberchef_to_modhex`)
Converts the input string to modhex bytes separated by the specified delimiter.

**Arguments:**
*   `delimiter` (Enum: [Space, Percent, Comma, Semi-colon, Colon, ...]): Default: Space,Percent,Comma,Semi-colon,Colon,Line feed,CRLF,None
*   `bytes_per_line` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_to_modhex", "arguments": { "input": "..." } }
```

---

#### From Modhex (`cyberchef_from_modhex`)
Converts a modhex byte string back into its raw value.

**Arguments:**
*   `delimiter` (Enum: [Auto, Space, Percent, Comma, Semi-colon, ...]): Default: Auto,Space,Percent,Comma,Semi-colon,Colon,Line feed,CRLF,None

**Example:**
```json
{ "name": "cyberchef_from_modhex", "arguments": { "input": "..." } }
```

---

#### MIME Decoding (`cyberchef_mime_decoding`)
Enables the decoding of MIME message header extensions for non-ASCII text

**Example:**
```json
{ "name": "cyberchef_mime_decoding", "arguments": { "input": "..." } }
```

---

### Encryption / Encoding

#### AES Encrypt (`cyberchef_aes_encrypt`)
Advanced Encryption Standard (AES) is a U.S. Federal Information Processing Standard (FIPS). It was selected after a 5-year process where 15 competing designs were evaluated.

Key: The following algorithms will be used based on the size of the key:16 bytes = AES-12824 bytes = AES-19232 bytes = AES-256You can generate a password-based key using one of the KDF operations.

IV: The Initialization Vector should be 16 bytes long. If not entered, it will default to 16 null bytes.

Padding: In CBC and ECB mode, PKCS#7 padding will be used.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `mode` (argSelector): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `input` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `output` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `additional_authenticated_data` (toggleString): Default: ""

**Example:**
```json
{ "name": "cyberchef_aes_encrypt", "arguments": { "input": "..." } }
```

---

#### AES Decrypt (`cyberchef_aes_decrypt`)
Advanced Encryption Standard (AES) is a U.S. Federal Information Processing Standard (FIPS). It was selected after a 5-year process where 15 competing designs were evaluated.

Key: The following algorithms will be used based on the size of the key:16 bytes = AES-12824 bytes = AES-19232 bytes = AES-256

IV: The Initialization Vector should be 16 bytes long. If not entered, it will default to 16 null bytes.

Padding: In CBC and ECB mode, PKCS#7 padding will be used as a default.

GCM Tag: This field is ignored unless 'GCM' mode is used.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `mode` (argSelector): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `input` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `output` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `gcm_tag` (toggleString): Default: ""
*   `additional_authenticated_data` (toggleString): Default: ""

**Example:**
```json
{ "name": "cyberchef_aes_decrypt", "arguments": { "input": "..." } }
```

---

#### Blowfish Encrypt (`cyberchef_blowfish_encrypt`)
Blowfish is a symmetric-key block cipher designed in 1993 by Bruce Schneier and included in a large number of cipher suites and encryption products. AES now receives more attention.

IV: The Initialization Vector should be 8 bytes long. If not entered, it will default to 8 null bytes.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `mode` (Enum: [CBC, CFB, OFB, CTR, ECB]): Default: CBC,CFB,OFB,CTR,ECB
*   `input` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `output` (Enum: [Hex, Raw]): Default: Hex,Raw

**Example:**
```json
{ "name": "cyberchef_blowfish_encrypt", "arguments": { "input": "..." } }
```

---

#### Blowfish Decrypt (`cyberchef_blowfish_decrypt`)
Blowfish is a symmetric-key block cipher designed in 1993 by Bruce Schneier and included in a large number of cipher suites and encryption products. AES now receives more attention.

IV: The Initialization Vector should be 8 bytes long. If not entered, it will default to 8 null bytes.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `mode` (Enum: [CBC, CFB, OFB, CTR, ECB]): Default: CBC,CFB,OFB,CTR,ECB
*   `input` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `output` (Enum: [Raw, Hex]): Default: Raw,Hex

**Example:**
```json
{ "name": "cyberchef_blowfish_decrypt", "arguments": { "input": "..." } }
```

---

#### DES Encrypt (`cyberchef_des_encrypt`)
DES is a previously dominant algorithm for encryption, and was published as an official U.S. Federal Information Processing Standard (FIPS). It is now considered to be insecure due to its small key size.

Key: DES uses a key length of 8 bytes (64 bits).

You can generate a password-based key using one of the KDF operations.

IV: The Initialization Vector should be 8 bytes long. If not entered, it will default to 8 null bytes.

Padding: In CBC and ECB mode, PKCS#7 padding will be used.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `mode` (Enum: [CBC, CFB, OFB, CTR, ECB]): Default: CBC,CFB,OFB,CTR,ECB
*   `input` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `output` (Enum: [Hex, Raw]): Default: Hex,Raw

**Example:**
```json
{ "name": "cyberchef_des_encrypt", "arguments": { "input": "..." } }
```

---

#### DES Decrypt (`cyberchef_des_decrypt`)
DES is a previously dominant algorithm for encryption, and was published as an official U.S. Federal Information Processing Standard (FIPS). It is now considered to be insecure due to its small key size.

Key: DES uses a key length of 8 bytes (64 bits).

IV: The Initialization Vector should be 8 bytes long. If not entered, it will default to 8 null bytes.

Padding: In CBC and ECB mode, PKCS#7 padding will be used as a default.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `mode` (Enum: [CBC, CFB, OFB, CTR, ECB, ...]): Default: CBC,CFB,OFB,CTR,ECB,CBC/NoPadding,ECB/NoPadding
*   `input` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `output` (Enum: [Raw, Hex]): Default: Raw,Hex

**Example:**
```json
{ "name": "cyberchef_des_decrypt", "arguments": { "input": "..." } }
```

---

#### Triple DES Encrypt (`cyberchef_triple_des_encrypt`)
Triple DES applies DES three times to each block to increase key size.

Key: Triple DES uses a key length of 24 bytes (192 bits).

You can generate a password-based key using one of the KDF operations.

IV: The Initialization Vector should be 8 bytes long. If not entered, it will default to 8 null bytes.

Padding: In CBC and ECB mode, PKCS#7 padding will be used.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `mode` (Enum: [CBC, CFB, OFB, CTR, ECB]): Default: CBC,CFB,OFB,CTR,ECB
*   `input` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `output` (Enum: [Hex, Raw]): Default: Hex,Raw

**Example:**
```json
{ "name": "cyberchef_triple_des_encrypt", "arguments": { "input": "..." } }
```

---

#### Triple DES Decrypt (`cyberchef_triple_des_decrypt`)
Triple DES applies DES three times to each block to increase key size.

Key: Triple DES uses a key length of 24 bytes (192 bits).

IV: The Initialization Vector should be 8 bytes long. If not entered, it will default to 8 null bytes.

Padding: In CBC and ECB mode, PKCS#7 padding will be used as a default.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `mode` (Enum: [CBC, CFB, OFB, CTR, ECB, ...]): Default: CBC,CFB,OFB,CTR,ECB,CBC/NoPadding,ECB/NoPadding
*   `input` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `output` (Enum: [Raw, Hex]): Default: Raw,Hex

**Example:**
```json
{ "name": "cyberchef_triple_des_decrypt", "arguments": { "input": "..." } }
```

---

#### Fernet Encrypt (`cyberchef_fernet_encrypt`)
Fernet is a symmetric encryption method which makes sure that the message encrypted cannot be manipulated/read without the key. It uses URL safe encoding for the keys. Fernet uses 128-bit AES in CBC mode and PKCS7 padding, with HMAC using SHA256 for authentication. The IV is created from os.random().

Key: The key must be 32 bytes (256 bits) encoded with Base64.

**Arguments:**
*   `key` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_fernet_encrypt", "arguments": { "input": "..." } }
```

---

#### Fernet Decrypt (`cyberchef_fernet_decrypt`)
Fernet is a symmetric encryption method which makes sure that the message encrypted cannot be manipulated/read without the key. It uses URL safe encoding for the keys. Fernet uses 128-bit AES in CBC mode and PKCS7 padding, with HMAC using SHA256 for authentication. The IV is created from os.random().

Key: The key must be 32 bytes (256 bits) encoded with Base64.

**Arguments:**
*   `key` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_fernet_decrypt", "arguments": { "input": "..." } }
```

---

#### LS47 Encrypt (`cyberchef_ls47_encrypt`)
This is a slight improvement of the ElsieFour cipher as described by Alan Kaminsky. We use 7x7 characters instead of original (barely fitting) 6x6, to be able to encrypt some structured information. We also describe a simple key-expansion algorithm, because remembering passwords is popular. Similar security considerations as with ElsieFour hold.
The LS47 alphabet consists of following characters: _abcdefghijklmnopqrstuvwxyz.0123456789,-+*/:?!'()
A LS47 key is a permutation of the alphabet that is then represented in a 7x7 grid used for the encryption or decryption.

**Arguments:**
*   `password` (string): Default: ""
*   `padding` (number): Default: 10
*   `signature` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_ls47_encrypt", "arguments": { "input": "..." } }
```

---

#### LS47 Decrypt (`cyberchef_ls47_decrypt`)
This is a slight improvement of the ElsieFour cipher as described by Alan Kaminsky. We use 7x7 characters instead of original (barely fitting) 6x6, to be able to encrypt some structured information. We also describe a simple key-expansion algorithm, because remembering passwords is popular. Similar security considerations as with ElsieFour hold.
The LS47 alphabet consists of following characters: _abcdefghijklmnopqrstuvwxyz.0123456789,-+*/:?!'()
An LS47 key is a permutation of the alphabet that is then represented in a 7x7 grid used for the encryption or decryption.

**Arguments:**
*   `password` (string): Default: ""
*   `padding` (number): Default: 10

**Example:**
```json
{ "name": "cyberchef_ls47_decrypt", "arguments": { "input": "..." } }
```

---

#### RC2 Encrypt (`cyberchef_rc2_encrypt`)
RC2 (also known as ARC2) is a symmetric-key block cipher designed by Ron Rivest in 1987. 'RC' stands for 'Rivest Cipher'.

Key: RC2 uses a variable size key.

You can generate a password-based key using one of the KDF operations.

IV: To run the cipher in CBC mode, the Initialization Vector should be 8 bytes long. If the IV is left blank, the cipher will run in ECB mode.

Padding: In both CBC and ECB mode, PKCS#7 padding will be used.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `input` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `output` (Enum: [Hex, Raw]): Default: Hex,Raw

**Example:**
```json
{ "name": "cyberchef_rc2_encrypt", "arguments": { "input": "..." } }
```

---

#### RC2 Decrypt (`cyberchef_rc2_decrypt`)
RC2 (also known as ARC2) is a symmetric-key block cipher designed by Ron Rivest in 1987. 'RC' stands for 'Rivest Cipher'.

Key: RC2 uses a variable size key.

IV: To run the cipher in CBC mode, the Initialization Vector should be 8 bytes long. If the IV is left blank, the cipher will run in ECB mode.

Padding: In both CBC and ECB mode, PKCS#7 padding will be used.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `input` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `output` (Enum: [Raw, Hex]): Default: Raw,Hex

**Example:**
```json
{ "name": "cyberchef_rc2_decrypt", "arguments": { "input": "..." } }
```

---

#### RC4 (`cyberchef_rc4`)
RC4 (also known as ARC4) is a widely-used stream cipher designed by Ron Rivest. It is used in popular protocols such as SSL and WEP. Although remarkable for its simplicity and speed, the algorithm's history doesn't inspire confidence in its security.

**Arguments:**
*   `passphrase` (toggleString): Default: ""
*   `input_format` (Enum: [Latin1, UTF8, UTF16, UTF16LE, UTF16BE, ...]): Default: Latin1,UTF8,UTF16,UTF16LE,UTF16BE,Hex,Base64
*   `output_format` (Enum: [Latin1, UTF8, UTF16, UTF16LE, UTF16BE, ...]): Default: Latin1,UTF8,UTF16,UTF16LE,UTF16BE,Hex,Base64

**Example:**
```json
{ "name": "cyberchef_rc4", "arguments": { "input": "..." } }
```

---

#### RC4 Drop (`cyberchef_rc4_drop`)
It was discovered that the first few bytes of the RC4 keystream are strongly non-random and leak information about the key. We can defend against this attack by discarding the initial portion of the keystream. This modified algorithm is traditionally called RC4-drop.

**Arguments:**
*   `passphrase` (toggleString): Default: ""
*   `input_format` (Enum: [Latin1, UTF8, UTF16, UTF16LE, UTF16BE, ...]): Default: Latin1,UTF8,UTF16,UTF16LE,UTF16BE,Hex,Base64
*   `output_format` (Enum: [Latin1, UTF8, UTF16, UTF16LE, UTF16BE, ...]): Default: Latin1,UTF8,UTF16,UTF16LE,UTF16BE,Hex,Base64
*   `number_of_dwords_to_drop` (number): Default: 192

**Example:**
```json
{ "name": "cyberchef_rc4_drop", "arguments": { "input": "..." } }
```

---

#### ChaCha (`cyberchef_chacha`)
ChaCha is a stream cipher designed by Daniel J. Bernstein. It is a variant of the Salsa stream cipher. Several parameterizations exist; 'ChaCha' may refer to the original construction, or to the variant as described in RFC-8439. ChaCha is often used with Poly1305, in the ChaCha20-Poly1305 AEAD construction.

Key: ChaCha uses a key of 16 or 32 bytes (128 or 256 bits).

Nonce: ChaCha uses a nonce of 8 or 12 bytes (64 or 96 bits).

Counter: ChaCha uses a counter of 4 or 8 bytes (32 or 64 bits); together, the nonce and counter must add up to 16 bytes. The counter starts at zero at the start of the keystream, and is incremented at every 64 bytes.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `nonce` (toggleString): Default: ""
*   `counter` (number): Default: 0
*   `rounds` (Enum: [20, 12, 8]): Default: 20,12,8
*   `input` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `output` (Enum: [Raw, Hex]): Default: Raw,Hex

**Example:**
```json
{ "name": "cyberchef_chacha", "arguments": { "input": "..." } }
```

---

#### Salsa20 (`cyberchef_salsa20`)
Salsa20 is a stream cipher designed by Daniel J. Bernstein and submitted to the eSTREAM project; Salsa20/8 and Salsa20/12 are round-reduced variants. It is closely related to the ChaCha stream cipher.

Key: Salsa20 uses a key of 16 or 32 bytes (128 or 256 bits).

Nonce: Salsa20 uses a nonce of 8 bytes (64 bits).

Counter: Salsa uses a counter of 8 bytes (64 bits). The counter starts at zero at the start of the keystream, and is incremented at every 64 bytes.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `nonce` (toggleString): Default: ""
*   `counter` (number): Default: 0
*   `rounds` (Enum: [20, 12, 8]): Default: 20,12,8
*   `input` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `output` (Enum: [Raw, Hex]): Default: Raw,Hex

**Example:**
```json
{ "name": "cyberchef_salsa20", "arguments": { "input": "..." } }
```

---

#### XSalsa20 (`cyberchef_xsalsa20`)
XSalsa20 is a variant of the Salsa20 stream cipher designed by Daniel J. Bernstein; XSalsa uses longer nonces.

Key: XSalsa20 uses a key of 16 or 32 bytes (128 or 256 bits).

Nonce: XSalsa20 uses a nonce of 24 bytes (192 bits).

Counter: XSalsa uses a counter of 8 bytes (64 bits). The counter starts at zero at the start of the keystream, and is incremented at every 64 bytes.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `nonce` (toggleString): Default: ""
*   `counter` (number): Default: 0
*   `rounds` (Enum: [20, 12, 8]): Default: 20,12,8
*   `input` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `output` (Enum: [Raw, Hex]): Default: Raw,Hex

**Example:**
```json
{ "name": "cyberchef_xsalsa20", "arguments": { "input": "..." } }
```

---

#### Rabbit (`cyberchef_rabbit`)
Rabbit is a high-speed stream cipher introduced in 2003 and defined in RFC 4503.

The cipher uses a 128-bit key and an optional 64-bit initialization vector (IV).

big-endian: based on RFC4503 and RFC3447
little-endian: compatible with Crypto++

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `endianness` (Enum: [Big, Little]): Default: Big,Little
*   `input` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `output` (Enum: [Raw, Hex]): Default: Raw,Hex

**Example:**
```json
{ "name": "cyberchef_rabbit", "arguments": { "input": "..." } }
```

---

#### SM4 Encrypt (`cyberchef_sm4_encrypt`)
SM4 is a 128-bit block cipher, currently established as a national standard (GB/T 32907-2016) of China. Multiple block cipher modes are supported. When using CBC or ECB mode, the PKCS#7 padding scheme is used.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `mode` (Enum: [CBC, CFB, OFB, CTR, ECB]): Default: CBC,CFB,OFB,CTR,ECB
*   `input` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `output` (Enum: [Hex, Raw]): Default: Hex,Raw

**Example:**
```json
{ "name": "cyberchef_sm4_encrypt", "arguments": { "input": "..." } }
```

---

#### SM4 Decrypt (`cyberchef_sm4_decrypt`)
SM4 is a 128-bit block cipher, currently established as a national standard (GB/T 32907-2016) of China.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `mode` (Enum: [CBC, CFB, OFB, CTR, ECB, ...]): Default: CBC,CFB,OFB,CTR,ECB,CBC/NoPadding,ECB/NoPadding
*   `input` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `output` (Enum: [Hex, Raw]): Default: Hex,Raw

**Example:**
```json
{ "name": "cyberchef_sm4_decrypt", "arguments": { "input": "..." } }
```

---

#### GOST Encrypt (`cyberchef_gost_encrypt`)
The GOST block cipher (Magma), defined in the standard GOST 28147-89 (RFC 5830), is a Soviet and Russian government standard symmetric key block cipher with a block size of 64 bits. The original standard, published in 1989, did not give the cipher any name, but the most recent revision of the standard, GOST R 34.12-2015 (RFC 7801, RFC 8891), specifies that it may be referred to as Magma. The GOST hash function is based on this cipher. The new standard also specifies a new 128-bit block cipher called Kuznyechik.

Developed in the 1970s, the standard had been marked 'Top Secret' and then downgraded to 'Secret' in 1990. Shortly after the dissolution of the USSR, it was declassified and it was released to the public in 1994. GOST 28147 was a Soviet alternative to the United States standard algorithm, DES. Thus, the two are very similar in structure.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `input_type` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `output_type` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `algorithm` (argSelector): Default: [object Object],[object Object],[object Object]
*   `sbox` (Enum: [E-TEST, E-A, E-B, E-C, E-D, ...]): Default: E-TEST,E-A,E-B,E-C,E-D,E-SC,E-Z,D-TEST,D-A,D-SC
*   `block_mode` (Enum: [ECB, CFB, OFB, CTR, CBC]): Default: ECB,CFB,OFB,CTR,CBC
*   `key_meshing_mode` (Enum: [NO, CP]): Default: NO,CP
*   `padding` (Enum: [NO, PKCS5, ZERO, RANDOM, BIT]): Default: NO,PKCS5,ZERO,RANDOM,BIT

**Example:**
```json
{ "name": "cyberchef_gost_encrypt", "arguments": { "input": "..." } }
```

---

#### GOST Decrypt (`cyberchef_gost_decrypt`)
The GOST block cipher (Magma), defined in the standard GOST 28147-89 (RFC 5830), is a Soviet and Russian government standard symmetric key block cipher with a block size of 64 bits. The original standard, published in 1989, did not give the cipher any name, but the most recent revision of the standard, GOST R 34.12-2015 (RFC 7801, RFC 8891), specifies that it may be referred to as Magma. The GOST hash function is based on this cipher. The new standard also specifies a new 128-bit block cipher called Kuznyechik.

Developed in the 1970s, the standard had been marked 'Top Secret' and then downgraded to 'Secret' in 1990. Shortly after the dissolution of the USSR, it was declassified and it was released to the public in 1994. GOST 28147 was a Soviet alternative to the United States standard algorithm, DES. Thus, the two are very similar in structure.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `input_type` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `output_type` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `algorithm` (argSelector): Default: [object Object],[object Object],[object Object]
*   `sbox` (Enum: [E-TEST, E-A, E-B, E-C, E-D, ...]): Default: E-TEST,E-A,E-B,E-C,E-D,E-SC,E-Z,D-TEST,D-A,D-SC
*   `block_mode` (Enum: [ECB, CFB, OFB, CTR, CBC]): Default: ECB,CFB,OFB,CTR,CBC
*   `key_meshing_mode` (Enum: [NO, CP]): Default: NO,CP
*   `padding` (Enum: [NO, PKCS5, ZERO, RANDOM, BIT]): Default: NO,PKCS5,ZERO,RANDOM,BIT

**Example:**
```json
{ "name": "cyberchef_gost_decrypt", "arguments": { "input": "..." } }
```

---

#### GOST Sign (`cyberchef_gost_sign`)
Sign a plaintext message using one of the GOST block ciphers.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `input_type` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `output_type` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `algorithm` (argSelector): Default: [object Object],[object Object],[object Object]
*   `sbox` (Enum: [E-TEST, E-A, E-B, E-C, E-D, ...]): Default: E-TEST,E-A,E-B,E-C,E-D,E-SC,E-Z,D-TEST,D-A,D-SC
*   `mac_length` (number): Default: 32

**Example:**
```json
{ "name": "cyberchef_gost_sign", "arguments": { "input": "..." } }
```

---

#### GOST Verify (`cyberchef_gost_verify`)
Verify the signature of a plaintext message using one of the GOST block ciphers. Enter the signature in the MAC field.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `iv` (toggleString): Default: ""
*   `mac` (toggleString): Default: ""
*   `input_type` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `algorithm` (argSelector): Default: [object Object],[object Object],[object Object]
*   `sbox` (Enum: [E-TEST, E-A, E-B, E-C, E-D, ...]): Default: E-TEST,E-A,E-B,E-C,E-D,E-SC,E-Z,D-TEST,D-A,D-SC

**Example:**
```json
{ "name": "cyberchef_gost_verify", "arguments": { "input": "..." } }
```

---

#### GOST Key Wrap (`cyberchef_gost_key_wrap`)
A key wrapping algorithm for protecting keys in untrusted storage using one of the GOST block cipers.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `user_key_material` (toggleString): Default: ""
*   `input_type` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `output_type` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `algorithm` (argSelector): Default: [object Object],[object Object],[object Object]
*   `sbox` (Enum: [E-TEST, E-A, E-B, E-C, E-D, ...]): Default: E-TEST,E-A,E-B,E-C,E-D,E-SC,E-Z,D-TEST,D-A,D-SC
*   `key_wrapping` (Enum: [NO, CP, SC]): Default: NO,CP,SC

**Example:**
```json
{ "name": "cyberchef_gost_key_wrap", "arguments": { "input": "..." } }
```

---

#### GOST Key Unwrap (`cyberchef_gost_key_unwrap`)
A decryptor for keys wrapped using one of the GOST block ciphers.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `user_key_material` (toggleString): Default: ""
*   `input_type` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `output_type` (Enum: [Raw, Hex]): Default: Raw,Hex
*   `algorithm` (argSelector): Default: [object Object],[object Object],[object Object]
*   `sbox` (Enum: [E-TEST, E-A, E-B, E-C, E-D, ...]): Default: E-TEST,E-A,E-B,E-C,E-D,E-SC,E-Z,D-TEST,D-A,D-SC
*   `key_wrapping` (Enum: [NO, CP, SC]): Default: NO,CP,SC

**Example:**
```json
{ "name": "cyberchef_gost_key_unwrap", "arguments": { "input": "..." } }
```

---

#### ROT13 (`cyberchef_rot13`)
A simple caesar substitution cipher which rotates alphabet characters by the specified amount (default 13).

**Arguments:**
*   `rotate_lower_case_chars` (boolean): Default: true
*   `rotate_upper_case_chars` (boolean): Default: true
*   `rotate_numbers` (boolean): Default: false
*   `amount` (number): Default: 13

**Example:**
```json
{ "name": "cyberchef_rot13", "arguments": { "input": "..." } }
```

---

#### ROT13 Brute Force (`cyberchef_rot13_brute_force`)
Try all meaningful amounts for ROT13.

Optionally you can enter your known plaintext (crib) to filter the result.

**Arguments:**
*   `rotate_lower_case_chars` (boolean): Default: true
*   `rotate_upper_case_chars` (boolean): Default: true
*   `rotate_numbers` (boolean): Default: false
*   `sample_length` (number): Default: 100
*   `sample_offset` (number): Default: 0
*   `print_amount` (boolean): Default: true
*   `crib_(known_plaintext_string)` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_rot13_brute_force", "arguments": { "input": "..." } }
```

---

#### ROT47 (`cyberchef_rot47`)
A slightly more complex variation of a caesar cipher, which includes ASCII characters from 33 '!' to 126 '~'. Default rotation: 47.

**Arguments:**
*   `amount` (number): Default: 47

**Example:**
```json
{ "name": "cyberchef_rot47", "arguments": { "input": "..." } }
```

---

#### ROT47 Brute Force (`cyberchef_rot47_brute_force`)
Try all meaningful amounts for ROT47.

Optionally you can enter your known plaintext (crib) to filter the result.

**Arguments:**
*   `sample_length` (number): Default: 100
*   `sample_offset` (number): Default: 0
*   `print_amount` (boolean): Default: true
*   `crib_(known_plaintext_string)` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_rot47_brute_force", "arguments": { "input": "..." } }
```

---

#### ROT8000 (`cyberchef_rot8000`)
The simple Caesar-cypher encryption that replaces each Unicode character with the one 0x8000 places forward or back along the alphabet.

**Example:**
```json
{ "name": "cyberchef_rot8000", "arguments": { "input": "..." } }
```

---

#### XOR (`cyberchef_xor`)
XOR the input with the given key.
e.g. fe023da5

Options
Null preserving: If the current byte is 0x00 or the same as the key, skip it.

Scheme:Standard - key is unchanged after each roundInput differential - key is set to the value of the previous unprocessed byteOutput differential - key is set to the value of the previous processed byteCascade - key is set to the input byte shifted by one

**Arguments:**
*   `key` (toggleString): Default: ""
*   `scheme` (Enum: [Standard, Input differential, Output differential, Cascade]): Default: Standard,Input differential,Output differential,Cascade
*   `null_preserving` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_xor", "arguments": { "input": "..." } }
```

---

#### XOR Brute Force (`cyberchef_xor_brute_force`)
Enumerate all possible XOR solutions. Current maximum key length is 2 due to browser performance.

Optionally enter a string that you expect to find in the plaintext to filter results (crib).

**Arguments:**
*   `key_length` (number): Default: 1
*   `sample_length` (number): Default: 100
*   `sample_offset` (number): Default: 0
*   `scheme` (Enum: [Standard, Input differential, Output differential]): Default: Standard,Input differential,Output differential
*   `null_preserving` (boolean): Default: false
*   `print_key` (boolean): Default: true
*   `output_as_hex` (boolean): Default: false
*   `crib_(known_plaintext_string)` (binaryString): Default: ""

**Example:**
```json
{ "name": "cyberchef_xor_brute_force", "arguments": { "input": "..." } }
```

---

#### Vigenère Encode (`cyberchef_vigen_re_encode`)
The Vigenere cipher is a method of encrypting alphabetic text by using a series of different Caesar ciphers based on the letters of a keyword. It is a simple form of polyalphabetic substitution.

**Arguments:**
*   `key` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_vigen_re_encode", "arguments": { "input": "..." } }
```

---

#### Vigenère Decode (`cyberchef_vigen_re_decode`)
The Vigenere cipher is a method of encrypting alphabetic text by using a series of different Caesar ciphers based on the letters of a keyword. It is a simple form of polyalphabetic substitution.

**Arguments:**
*   `key` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_vigen_re_decode", "arguments": { "input": "..." } }
```

---

#### XXTEA Encrypt (`cyberchef_xxtea_encrypt`)
Corrected Block TEA (often referred to as XXTEA) is a block cipher designed to correct weaknesses in the original Block TEA. XXTEA operates on variable-length blocks that are some arbitrary multiple of 32 bits in size (minimum 64 bits). The number of full cycles depends on the block size, but there are at least six (rising to 32 for small block sizes). The original Block TEA applies the XTEA round function to each word in the block and combines it additively with its leftmost neighbour. Slow diffusion rate of the decryption process was immediately exploited to break the cipher. Corrected Block TEA uses a more involved round function which makes use of both immediate neighbours in processing each word in the block.

**Arguments:**
*   `key` (toggleString): Default: ""

**Example:**
```json
{ "name": "cyberchef_xxtea_encrypt", "arguments": { "input": "..." } }
```

---

#### XXTEA Decrypt (`cyberchef_xxtea_decrypt`)
Corrected Block TEA (often referred to as XXTEA) is a block cipher designed to correct weaknesses in the original Block TEA. XXTEA operates on variable-length blocks that are some arbitrary multiple of 32 bits in size (minimum 64 bits). The number of full cycles depends on the block size, but there are at least six (rising to 32 for small block sizes). The original Block TEA applies the XTEA round function to each word in the block and combines it additively with its leftmost neighbour. Slow diffusion rate of the decryption process was immediately exploited to break the cipher. Corrected Block TEA uses a more involved round function which makes use of both immediate neighbours in processing each word in the block.

**Arguments:**
*   `key` (toggleString): Default: ""

**Example:**
```json
{ "name": "cyberchef_xxtea_decrypt", "arguments": { "input": "..." } }
```

---

#### To Morse Code (`cyberchef_to_morse_code`)
Translates alphanumeric characters into International Morse Code.

Ignores non-Morse characters.

e.g. SOS becomes ... --- ...

**Arguments:**
*   `format_options` (Enum: [-/., _/., Dash/Dot, DASH/DOT, dash/dot]): Default: -/.,_/.,Dash/Dot,DASH/DOT,dash/dot
*   `letter_delimiter` (Enum: [Space, Line feed, CRLF, Forward slash, Backslash, ...]): Default: Space,Line feed,CRLF,Forward slash,Backslash,Comma,Semi-colon,Colon
*   `word_delimiter` (Enum: [Line feed, CRLF, Forward slash, Backslash, Comma, ...]): Default: Line feed,CRLF,Forward slash,Backslash,Comma,Semi-colon,Colon

**Example:**
```json
{ "name": "cyberchef_to_morse_code", "arguments": { "input": "..." } }
```

---

#### From Morse Code (`cyberchef_from_morse_code`)
Translates Morse Code into (upper case) alphanumeric characters.

**Arguments:**
*   `letter_delimiter` (Enum: [Space, Line feed, CRLF, Forward slash, Backslash, ...]): Default: Space,Line feed,CRLF,Forward slash,Backslash,Comma,Semi-colon,Colon
*   `word_delimiter` (Enum: [Line feed, CRLF, Forward slash, Backslash, Comma, ...]): Default: Line feed,CRLF,Forward slash,Backslash,Comma,Semi-colon,Colon

**Example:**
```json
{ "name": "cyberchef_from_morse_code", "arguments": { "input": "..." } }
```

---

#### Bacon Cipher Encode (`cyberchef_bacon_cipher_encode`)
Bacon's cipher or the Baconian cipher is a method of steganography devised by Francis Bacon in 1605. A message is concealed in the presentation of text, rather than its content.

**Arguments:**
*   `alphabet` (Enum: [Standard (I=J and U=V), Complete]): Default: Standard (I=J and U=V),Complete
*   `translation` (Enum: [0/1, A/B]): Default: 0/1,A/B
*   `keep_extra_characters` (boolean): Default: false
*   `invert_translation` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_bacon_cipher_encode", "arguments": { "input": "..." } }
```

---

#### Bacon Cipher Decode (`cyberchef_bacon_cipher_decode`)
Bacon's cipher or the Baconian cipher is a method of steganography devised by Francis Bacon in 1605. A message is concealed in the presentation of text, rather than its content.

**Arguments:**
*   `alphabet` (Enum: [Standard (I=J and U=V), Complete]): Default: Standard (I=J and U=V),Complete
*   `translation` (Enum: [0/1, A/B, Case, A-M/N-Z first letter]): Default: 0/1,A/B,Case,A-M/N-Z first letter
*   `invert_translation` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_bacon_cipher_decode", "arguments": { "input": "..." } }
```

---

#### Bifid Cipher Encode (`cyberchef_bifid_cipher_encode`)
The Bifid cipher is a cipher which uses a Polybius square in conjunction with transposition, which can be fairly difficult to decipher without knowing the alphabet keyword.

**Arguments:**
*   `keyword` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_bifid_cipher_encode", "arguments": { "input": "..." } }
```

---

#### Bifid Cipher Decode (`cyberchef_bifid_cipher_decode`)
The Bifid cipher is a cipher which uses a Polybius square in conjunction with transposition, which can be fairly difficult to decipher without knowing the alphabet keyword.

**Arguments:**
*   `keyword` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_bifid_cipher_decode", "arguments": { "input": "..." } }
```

---

#### Caesar Box Cipher (`cyberchef_caesar_box_cipher`)
Caesar Box is a transposition cipher used in the Roman Empire, in which letters of the message are written in rows in a square (or a rectangle) and then, read by column.

**Arguments:**
*   `box_height` (number): Default: 1

**Example:**
```json
{ "name": "cyberchef_caesar_box_cipher", "arguments": { "input": "..." } }
```

---

#### Affine Cipher Encode (`cyberchef_affine_cipher_encode`)
The Affine cipher is a type of monoalphabetic substitution cipher, wherein each letter in an alphabet is mapped to its numeric equivalent, encrypted using simple mathematical function, (ax + b) % 26, and converted back to a letter.

**Arguments:**
*   `a` (number): Default: 1
*   `b` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_affine_cipher_encode", "arguments": { "input": "..." } }
```

---

#### Affine Cipher Decode (`cyberchef_affine_cipher_decode`)
The Affine cipher is a type of monoalphabetic substitution cipher. To decrypt, each letter in an alphabet is mapped to its numeric equivalent, decrypted by a mathematical function, and converted back to a letter.

**Arguments:**
*   `a` (number): Default: 1
*   `b` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_affine_cipher_decode", "arguments": { "input": "..." } }
```

---

#### A1Z26 Cipher Encode (`cyberchef_a1z26_cipher_encode`)
Converts alphabet characters into their corresponding alphabet order number.

e.g. a becomes 1 and b becomes 2.

Non-alphabet characters are dropped.

**Arguments:**
*   `delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Line feed, ...]): Default: Space,Comma,Semi-colon,Colon,Line feed,CRLF

**Example:**
```json
{ "name": "cyberchef_a1z26_cipher_encode", "arguments": { "input": "..." } }
```

---

#### A1Z26 Cipher Decode (`cyberchef_a1z26_cipher_decode`)
Converts alphabet order numbers into their corresponding  alphabet character.

e.g. 1 becomes a and 2 becomes b.

**Arguments:**
*   `delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Line feed, ...]): Default: Space,Comma,Semi-colon,Colon,Line feed,CRLF

**Example:**
```json
{ "name": "cyberchef_a1z26_cipher_decode", "arguments": { "input": "..." } }
```

---

#### Rail Fence Cipher Encode (`cyberchef_rail_fence_cipher_encode`)
Encodes Strings using the Rail fence Cipher provided a key and an offset

**Arguments:**
*   `key` (number): Default: 2
*   `offset` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_rail_fence_cipher_encode", "arguments": { "input": "..." } }
```

---

#### Rail Fence Cipher Decode (`cyberchef_rail_fence_cipher_decode`)
Decodes Strings that were created using the Rail fence Cipher provided a key and an offset

**Arguments:**
*   `key` (number): Default: 2
*   `offset` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_rail_fence_cipher_decode", "arguments": { "input": "..." } }
```

---

#### Atbash Cipher (`cyberchef_atbash_cipher`)
Atbash is a mono-alphabetic substitution cipher originally used to encode the Hebrew alphabet. It has been modified here for use with the Latin alphabet.

**Example:**
```json
{ "name": "cyberchef_atbash_cipher", "arguments": { "input": "..." } }
```

---

#### CipherSaber2 Encrypt (`cyberchef_ciphersaber2_encrypt`)
CipherSaber is a simple symmetric encryption protocol based on the RC4 stream cipher. It gives reasonably strong protection of message confidentiality, yet it's designed to be simple enough that even novice programmers can memorize the algorithm and implement it from scratch.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `rounds` (number): Default: 20

**Example:**
```json
{ "name": "cyberchef_ciphersaber2_encrypt", "arguments": { "input": "..." } }
```

---

#### CipherSaber2 Decrypt (`cyberchef_ciphersaber2_decrypt`)
CipherSaber is a simple symmetric encryption protocol based on the RC4 stream cipher. It gives reasonably strong protection of message confidentiality, yet it's designed to be simple enough that even novice programmers can memorize the algorithm and implement it from scratch.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `rounds` (number): Default: 20

**Example:**
```json
{ "name": "cyberchef_ciphersaber2_decrypt", "arguments": { "input": "..." } }
```

---

#### Cetacean Cipher Encode (`cyberchef_cetacean_cipher_encode`)
Converts any input into Cetacean Cipher. e.g. hi becomes EEEEEEEEEeeEeEEEEEEEEEEEEeeEeEEe

**Example:**
```json
{ "name": "cyberchef_cetacean_cipher_encode", "arguments": { "input": "..." } }
```

---

#### Cetacean Cipher Decode (`cyberchef_cetacean_cipher_decode`)
Decode Cetacean Cipher input. e.g. EEEEEEEEEeeEeEEEEEEEEEEEEeeEeEEe becomes hi

**Example:**
```json
{ "name": "cyberchef_cetacean_cipher_decode", "arguments": { "input": "..." } }
```

---

#### Substitute (`cyberchef_substitute`)
A substitution cipher allowing you to specify bytes to replace with other byte values. This can be used to create Caesar ciphers but is more powerful as any byte value can be substituted, not just letters, and the substitution values need not be in order.

Enter the bytes you want to replace in the Plaintext field and the bytes to replace them with in the Ciphertext field.

Non-printable bytes can be specified using string escape notation. For example, a line feed character can be written as either \n or \x0a.

Byte ranges can be specified using a hyphen. For example, the sequence 0123456789 can be written as 0-9.

Note that blackslash characters are used to escape special characters, so will need to be escaped themselves if you want to use them on their own (e.g.\\).

**Arguments:**
*   `plaintext` (binaryString): Default: ABCDEFGHIJKLMNOPQRSTUVWXYZ
*   `ciphertext` (binaryString): Default: XYZABCDEFGHIJKLMNOPQRSTUVW
*   `ignore_case` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_substitute", "arguments": { "input": "..." } }
```

---

#### Derive PBKDF2 key (`cyberchef_derive_pbkdf2_key`)
PBKDF2 is a password-based key derivation function. It is part of RSA Laboratories' Public-Key Cryptography Standards (PKCS) series, specifically PKCS #5 v2.0, also published as Internet Engineering Task Force's RFC 2898.

In many applications of cryptography, user security is ultimately dependent on a password, and because a password usually can't be used directly as a cryptographic key, some processing is required.

A salt provides a large set of keys for any given password, and an iteration count increases the cost of producing keys from a password, thereby also increasing the difficulty of attack.

If you leave the salt argument empty, a random salt will be generated.

**Arguments:**
*   `passphrase` (toggleString): Default: ""
*   `key_size` (number): Default: 128
*   `iterations` (number): Default: 1
*   `hashing_function` (Enum: [SHA1, SHA256, SHA384, SHA512, MD5]): Default: SHA1,SHA256,SHA384,SHA512,MD5
*   `salt` (toggleString): Default: ""

**Example:**
```json
{ "name": "cyberchef_derive_pbkdf2_key", "arguments": { "input": "..." } }
```

---

#### Derive EVP key (`cyberchef_derive_evp_key`)
This operation performs a password-based key derivation function (PBKDF) used extensively in OpenSSL. In many applications of cryptography, user security is ultimately dependent on a password, and because a password usually can't be used directly as a cryptographic key, some processing is required.

A salt provides a large set of keys for any given password, and an iteration count increases the cost of producing keys from a password, thereby also increasing the difficulty of attack.

If you leave the salt argument empty, a random salt will be generated.

**Arguments:**
*   `passphrase` (toggleString): Default: ""
*   `key_size` (number): Default: 128
*   `iterations` (number): Default: 1
*   `hashing_function` (Enum: [SHA1, SHA256, SHA384, SHA512, MD5]): Default: SHA1,SHA256,SHA384,SHA512,MD5
*   `salt` (toggleString): Default: ""

**Example:**
```json
{ "name": "cyberchef_derive_evp_key", "arguments": { "input": "..." } }
```

---

#### Derive HKDF key (`cyberchef_derive_hkdf_key`)
A simple Hashed Message Authenticaton Code (HMAC)-based key derivation function (HKDF), defined in RFC5869.

**Arguments:**
*   `salt` (toggleString): Default: ""
*   `info` (toggleString): Default: ""
*   `hashing_function` (Enum: [MD2, MD4, MD5, SHA0, SHA1, ...]): Default: MD2,MD4,MD5,SHA0,SHA1,SHA224,SHA256,SHA384,SHA512,SHA512/224,SHA512/256,RIPEMD128,RIPEMD160,RIPEMD256,RIPEMD320,HAS160,Whirlpool,Whirlpool-0,Whirlpool-T,Snefru
*   `extract_mode` (argSelector): Default: [object Object],[object Object],[object Object]
*   `l_(number_of_output_octets)` (number): Default: 16

**Example:**
```json
{ "name": "cyberchef_derive_hkdf_key", "arguments": { "input": "..." } }
```

---

#### Bcrypt (`cyberchef_bcrypt`)
bcrypt is a password hashing function designed by Niels Provos and David Mazières, based on the Blowfish cipher, and presented at USENIX in 1999. Besides incorporating a salt to protect against rainbow table attacks, bcrypt is an adaptive function: over time, the iteration count (rounds) can be increased to make it slower, so it remains resistant to brute-force search attacks even with increasing computation power.

Enter the password in the input to generate its hash.

**Arguments:**
*   `rounds` (number): Default: 10

**Example:**
```json
{ "name": "cyberchef_bcrypt", "arguments": { "input": "..." } }
```

---

#### Scrypt (`cyberchef_scrypt`)
scrypt is a password-based key derivation function (PBKDF) created by Colin Percival. The algorithm was specifically designed to make it costly to perform large-scale custom hardware attacks by requiring large amounts of memory. In 2016, the scrypt algorithm was published by IETF as RFC 7914.

Enter the password in the input to generate its hash.

**Arguments:**
*   `salt` (toggleString): Default: ""
*   `iterations_(n)` (number): Default: 16384
*   `memory_factor_(r)` (number): Default: 8
*   `parallelization_factor_(p)` (number): Default: 1
*   `key_length` (number): Default: 64

**Example:**
```json
{ "name": "cyberchef_scrypt", "arguments": { "input": "..." } }
```

---

#### JWT Sign (`cyberchef_jwt_sign`)
Signs a JSON object as a JSON Web Token using a provided secret / private key.

The key should be either the secret for HMAC algorithms or the PEM-encoded private key for RSA and ECDSA.

**Arguments:**
*   `private/secret_key` (text): Default: secret
*   `signing_algorithm` (Enum: [HS256, HS384, HS512, RS256, RS384, ...]): Default: HS256,HS384,HS512,RS256,RS384,RS512,ES256,ES384,ES512,None
*   `header` (text): Default: {}

**Example:**
```json
{ "name": "cyberchef_jwt_sign", "arguments": { "input": "..." } }
```

---

#### JWT Verify (`cyberchef_jwt_verify`)
Verifies that a JSON Web Token is valid and has been signed with the provided secret / private key.

The key should be either the secret for HMAC algorithms or the PEM-encoded public key for RSA and ECDSA.

**Arguments:**
*   `public/secret_key` (text): Default: secret

**Example:**
```json
{ "name": "cyberchef_jwt_verify", "arguments": { "input": "..." } }
```

---

#### JWT Decode (`cyberchef_jwt_decode`)
Decodes a JSON Web Token without checking whether the provided secret / private key is valid. Use 'JWT Verify' to check if the signature is valid as well.

**Example:**
```json
{ "name": "cyberchef_jwt_decode", "arguments": { "input": "..." } }
```

---

#### Citrix CTX1 Encode (`cyberchef_citrix_ctx1_encode`)
Encodes strings to Citrix CTX1 password format.

**Example:**
```json
{ "name": "cyberchef_citrix_ctx1_encode", "arguments": { "input": "..." } }
```

---

#### Citrix CTX1 Decode (`cyberchef_citrix_ctx1_decode`)
Decodes strings in a Citrix CTX1 password format to plaintext.

**Example:**
```json
{ "name": "cyberchef_citrix_ctx1_decode", "arguments": { "input": "..." } }
```

---

#### AES Key Wrap (`cyberchef_aes_key_wrap`)
A key wrapping algorithm defined in RFC3394, which is used to protect keys in untrusted storage or communications, using AES.

This algorithm uses an AES key (KEK: key-encryption key) and a 64-bit IV to encrypt 64-bit blocks.

**Arguments:**
*   `key_(kek)` (toggleString): Default: ""
*   `iv` (toggleString): Default: a6a6a6a6a6a6a6a6
*   `input` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `output` (Enum: [Hex, Raw]): Default: Hex,Raw

**Example:**
```json
{ "name": "cyberchef_aes_key_wrap", "arguments": { "input": "..." } }
```

---

#### AES Key Unwrap (`cyberchef_aes_key_unwrap`)
Decryptor for a key wrapping algorithm defined in RFC3394, which is used to protect keys in untrusted storage or communications, using AES.

This algorithm uses an AES key (KEK: key-encryption key) and a 64-bit IV to decrypt 64-bit blocks.

**Arguments:**
*   `key_(kek)` (toggleString): Default: ""
*   `iv` (toggleString): Default: a6a6a6a6a6a6a6a6
*   `input` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `output` (Enum: [Hex, Raw]): Default: Hex,Raw

**Example:**
```json
{ "name": "cyberchef_aes_key_unwrap", "arguments": { "input": "..." } }
```

---

#### Pseudo-Random Number Generator (`cyberchef_pseudo_random_number_generator`)
A cryptographically-secure pseudo-random number generator (PRNG).

This operation uses the browser's built-in crypto.getRandomValues() method if available. If this cannot be found, it falls back to a Fortuna-based PRNG algorithm.

**Arguments:**
*   `number_of_bytes` (number): Default: 32
*   `output_as` (Enum: [Hex, Integer, Byte array, Raw]): Default: Hex,Integer,Byte array,Raw

**Example:**
```json
{ "name": "cyberchef_pseudo_random_number_generator", "arguments": { "input": "..." } }
```

---

#### Enigma (`cyberchef_enigma`)
Encipher/decipher with the WW2 Enigma machine.

Enigma was used by the German military, among others, around the WW2 era as a portable cipher machine to protect sensitive military, diplomatic and commercial communications.

The standard set of German military rotors and reflectors are provided. To configure the plugboard, enter a string of connected pairs of letters, e.g. AB CD EF connects A to B, C to D, and E to F. This is also used to create your own reflectors. To create your own rotor, enter the letters that the rotor maps A to Z to, in order, optionally followed by &lt; then a list of stepping points.
This is deliberately fairly permissive with rotor placements etc compared to a real Enigma (on which, for example, a four-rotor Enigma uses only the thin reflectors and the beta or gamma rotor in the 4th slot).

More detailed descriptions of the Enigma, Typex and Bombe operations can be found here.

**Arguments:**
*   `model` (argSelector): Default: [object Object],[object Object]
*   `left-most_(4th)_rotor` (Enum: [Beta, Gamma]): Default: [object Object],[object Object]
*   `left-most_rotor_ring_setting` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `left-most_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `left-hand_rotor` (Enum: [I, II, III, IV, V, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `left-hand_rotor_ring_setting` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `left-hand_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `middle_rotor` (Enum: [I, II, III, IV, V, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `middle_rotor_ring_setting` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `middle_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `right-hand_rotor` (Enum: [I, II, III, IV, V, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `right-hand_rotor_ring_setting` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `right-hand_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `reflector` (Enum: [B, C, B Thin, C Thin]): Default: [object Object],[object Object],[object Object],[object Object]
*   `plugboard` (string): Default: ""
*   `strict_output` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_enigma", "arguments": { "input": "..." } }
```

---

#### Bombe (`cyberchef_bombe`)
Emulation of the Bombe machine used at Bletchley Park to attack Enigma, based on work by Polish and British cryptanalysts.

To run this you need to have a 'crib', which is some known plaintext for a chunk of the target ciphertext, and know the rotors used. (See the 'Bombe (multiple runs)' operation if you don't know the rotors.) The machine will suggest possible configurations of the Enigma. Each suggestion has the rotor start positions (left to right) and known plugboard pairs.

Choosing a crib: First, note that Enigma cannot encrypt a letter to itself, which allows you to rule out some positions for possible cribs. Secondly, the Bombe does not simulate the Enigma's middle rotor stepping. The longer your crib, the more likely a step happened within it, which will prevent the attack working. However, other than that, longer cribs are generally better. The attack produces a 'menu' which maps ciphertext letters to plaintext, and the goal is to produce 'loops': for example, with ciphertext ABC and crib CAB, we have the mappings A&lt;-&gt;C, B&lt;-&gt;A, and C&lt;-&gt;B, which produces a loop A-B-C-A. The more loops, the better the crib. The operation will output this: if your menu has too few loops or is too short, a large number of incorrect outputs will usually be produced. Try a different crib. If the menu seems good but the right answer isn't produced, your crib may be wrong, or you may have overlapped the middle rotor stepping - try a different crib.

Output is not sufficient to fully decrypt the data. You will have to recover the rest of the plugboard settings by inspection. And the ring position is not taken into account: this affects when the middle rotor steps. If your output is correct for a bit, and then goes wrong, adjust the ring and start position on the right-hand rotor together until the output improves. If necessary, repeat for the middle rotor.

By default this operation runs the checking machine, a manual process to verify the quality of Bombe stops, on each stop, discarding stops which fail. If you want to see how many times the hardware actually stops for a given input, disable the checking machine.

More detailed descriptions of the Enigma, Typex and Bombe operations can be found here.

**Arguments:**
*   `model` (argSelector): Default: [object Object],[object Object]
*   `left-most_(4th)_rotor` (Enum: [Beta, Gamma]): Default: [object Object],[object Object]
*   `left-hand_rotor` (Enum: [I, II, III, IV, V, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `middle_rotor` (Enum: [I, II, III, IV, V, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `right-hand_rotor` (Enum: [I, II, III, IV, V, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `reflector` (Enum: [B, C, B Thin, C Thin]): Default: [object Object],[object Object],[object Object],[object Object]
*   `crib` (string): Default: ""
*   `crib_offset` (number): Default: 0
*   `use_checking_machine` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_bombe", "arguments": { "input": "..." } }
```

---

#### Multiple Bombe (`cyberchef_multiple_bombe`)
Emulation of the Bombe machine used to attack Enigma. This version carries out multiple Bombe runs to handle unknown rotor configurations.

You should test your menu on the single Bombe operation before running it here. See the description of the Bombe operation for instructions on choosing a crib.

More detailed descriptions of the Enigma, Typex and Bombe operations can be found here.

**Arguments:**
*   `standard_enigmas` (populateMultiOption): Default: [object Object],[object Object],[object Object],[object Object],[object Object]
*   `main_rotors` (text): Default: ""
*   `4th_rotor` (text): Default: ""
*   `reflectors` (text): Default: ""
*   `crib` (string): Default: ""
*   `crib_offset` (number): Default: 0
*   `use_checking_machine` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_multiple_bombe", "arguments": { "input": "..." } }
```

---

#### Typex (`cyberchef_typex`)
Encipher/decipher with the WW2 Typex machine.

Typex was originally built by the British Royal Air Force prior to WW2, and is based on the Enigma machine with some improvements made, including using five rotors with more stepping points and interchangeable wiring cores. It was used across the British and Commonwealth militaries. A number of later variants were produced; here we simulate a WW2 era Mark 22 Typex with plugboards for the reflector and input. Typex rotors were changed regularly and none are public: a random example set are provided.

To configure the reflector plugboard, enter a string of connected pairs of letters in the reflector box, e.g. AB CD EF connects A to B, C to D, and E to F (you'll need to connect every letter). There is also an input plugboard: unlike Enigma's plugboard, it's not restricted to pairs, so it's entered like a rotor (without stepping). To create your own rotor, enter the letters that the rotor maps A to Z to, in order, optionally followed by &lt; then a list of stepping points.

More detailed descriptions of the Enigma, Typex and Bombe operations can be found here.

**Arguments:**
*   `1st_(left-hand)_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `1st_rotor_reversed` (boolean): Default: false
*   `1st_rotor_ring_setting` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `1st_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `2nd_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `2nd_rotor_reversed` (boolean): Default: false
*   `2nd_rotor_ring_setting` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `2nd_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `3rd_(middle)_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `3rd_rotor_reversed` (boolean): Default: false
*   `3rd_rotor_ring_setting` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `3rd_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `4th_(static)_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `4th_rotor_reversed` (boolean): Default: false
*   `4th_rotor_ring_setting` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `4th_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `5th_(right-hand,_static)_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `5th_rotor_reversed` (boolean): Default: false
*   `5th_rotor_ring_setting` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `5th_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `reflector` (Enum: [Example]): Default: [object Object]
*   `plugboard` (string): Default: ""
*   `typex_keyboard_emulation` (Enum: [None, Encrypt, Decrypt]): Default: None,Encrypt,Decrypt
*   `strict_output` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_typex", "arguments": { "input": "..." } }
```

---

#### Lorenz (`cyberchef_lorenz`)
The Lorenz SZ40/42 cipher attachment was a WW2 German rotor cipher machine with twelve rotors which attached in-line between remote teleprinters.

It used the Vernam cipher with two groups of five rotors (named the psi(ψ) wheels and chi(χ) wheels at Bletchley Park) to create two pseudorandom streams of five bits, encoded in ITA2, which were XOR added to the plaintext. Two other rotors, dubbed the mu(μ) or motor wheels, could hold up the stepping of the psi wheels meaning they stepped intermittently.

Each rotor has a different number of cams/lugs around their circumference which could be set active or inactive changing the key stream.

Three models of the Lorenz are emulated, SZ40, SZ42a and SZ42b and three example wheel patterns (the lug settings) are included (KH, ZMUG & BREAM) with the option to set a custom set using the letter 'x' for active or '.' for an inactive lug.

The input can either be plaintext or ITA2 when sending and ITA2 when receiving.

To learn more, Virtual Lorenz, an online, browser based simulation of the Lorenz SZ40/42 is available at lorenz.virtualcolossus.co.uk.

A more detailed description of this operation can be found here.

**Arguments:**
*   `model` (Enum: [SZ40, SZ42a, SZ42b]): Default: SZ40,SZ42a,SZ42b
*   `wheel_pattern` (argSelector): Default: [object Object],[object Object],[object Object],[object Object],[object Object]
*   `kt-schalter` (boolean): Default: false
*   `mode` (argSelector): Default: [object Object],[object Object]
*   `input_type` (Enum: [Plaintext, ITA2]): Default: Plaintext,ITA2
*   `output_type` (Enum: [Plaintext, ITA2]): Default: Plaintext,ITA2
*   `ita2_format` (Enum: [5/8/9, +/-/.]): Default: 5/8/9,+/-/.
*   `ψ1_start_(1-43)` (number): Default: 1
*   `ψ2_start_(1-47)` (number): Default: 1
*   `ψ3_start_(1-51)` (number): Default: 1
*   `ψ4_start_(1-53)` (number): Default: 1
*   `ψ5_start_(1-59)` (number): Default: 1
*   `μ37_start_(1-37)` (number): Default: 1
*   `μ61_start_(1-61)` (number): Default: 1
*   `χ1_start_(1-41)` (number): Default: 1
*   `χ2_start_(1-31)` (number): Default: 1
*   `χ3_start_(1-29)` (number): Default: 1
*   `χ4_start_(1-26)` (number): Default: 1
*   `χ5_start_(1-23)` (number): Default: 1
*   `ψ1_lugs_(43)` (string): Default: .x...xx.x.x..xxx.x.x.xxxx.x.x.x.x.x..x.xx.x
*   `ψ2_lugs_(47)` (string): Default: .xx.x.xxx..x.x.x..x.xx.x.xxx.x....x.xx.x.x.x..x
*   `ψ3_lugs_(51)` (string): Default: .x.x.x..xxx....x.x.xx.x.x.x..xxx.x.x..x.x.xx..x.x.x
*   `ψ4_lugs_(53)` (string): Default: .xx...xxxxx.x.x.xx...x.xx.x.x..x.x.xx.x..x.x.x.x.x.x.
*   `ψ5_lugs_(59)` (string): Default: xx...xx.x..x.xx.x...x.x.x.x.x.x.x.x.xx..xxxx.x.x...xx.x..x.
*   `μ37_lugs_(37)` (string): Default: x.x.x.x.x.x...x.x.x...x.x.x...x.x....
*   `μ61_lugs_(61)` (string): Default: .xxxx.xxxx.xxx.xxxx.xx....xxx.xxxx.xxxx.xxxx.xxxx.xxx.xxxx...
*   `χ1_lugs_(41)` (string): Default: .x...xxx.x.xxxx.x...x.x..xxx....xx.xxxx..
*   `χ2_lugs_(31)` (string): Default: x..xxx...x.xxxx..xx..x..xx.xx..
*   `χ3_lugs_(29)` (string): Default: ..xx..x.xxx...xx...xx..xx.xx.
*   `χ4_lugs_(26)` (string): Default: xx..x..xxxx..xx.xxx....x..
*   `χ5_lugs_(23)` (string): Default: xx..xx....xxxx.x..x.x..

**Example:**
```json
{ "name": "cyberchef_lorenz", "arguments": { "input": "..." } }
```

---

#### Colossus (`cyberchef_colossus`)
Colossus is the name of the world's first electronic computer. Ten Colossi were designed by Tommy Flowers and built at the Post Office Research Labs at Dollis Hill in 1943 during World War 2. They assisted with the breaking of the German Lorenz cipher attachment, a machine created to encipher communications between Hitler and his generals on the front lines.

To learn more, Virtual Colossus, an online, browser based simulation of a Colossus computer is available at virtualcolossus.co.uk.

A more detailed description of this operation can be found here.

**Arguments:**
*   `input` (label): Default: undefined
*   `pattern` (Enum: [KH Pattern, ZMUG Pattern, BREAM Pattern]): Default: KH Pattern,ZMUG Pattern,BREAM Pattern
*   `qbusz` (Enum: [, Z, ΔZ]): Default: ,Z,ΔZ
*   `qbusχ` (Enum: [, Χ, ΔΧ]): Default: ,Χ,ΔΧ
*   `qbusψ` (Enum: [, Ψ, ΔΨ]): Default: ,Ψ,ΔΨ
*   `limitation` (Enum: [None, Χ2, Χ2 + P5, X2 + Ψ1, X2 + Ψ1 + P5]): Default: None,Χ2,Χ2 + P5,X2 + Ψ1,X2 + Ψ1 + P5
*   `k_rack_option` (argSelector): Default: [object Object],[object Object],[object Object],[object Object]
*   `program_to_run` (Enum: [, Letter Count, 1+2=. (1+2 Break In, Find X1,X2), 4=5=/1=2 (Given X1,X2 find X4,X5), /,5,U (Count chars to find X3)]): Default: ,Letter Count,1+2=. (1+2 Break In, Find X1,X2),4=5=/1=2 (Given X1,X2 find X4,X5),/,5,U (Count chars to find X3)
*   `k_rack:_conditional` (label): Default: undefined
*   `r1-q1` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r1-q2` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r1-q3` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r1-q4` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r1-q5` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r1-negate` (boolean): Default: false
*   `r1-counter` (Enum: [, 1, 2, 3, 4, ...]): Default: ,1,2,3,4,5
*   `r2-q1` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r2-q2` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r2-q3` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r2-q4` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r2-q5` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r2-negate` (boolean): Default: false
*   `r2-counter` (Enum: [, 1, 2, 3, 4, ...]): Default: ,1,2,3,4,5
*   `r3-q1` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r3-q2` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r3-q3` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r3-q4` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r3-q5` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `r3-negate` (boolean): Default: false
*   `r3-counter` (Enum: [, 1, 2, 3, 4, ...]): Default: ,1,2,3,4,5
*   `negate_all` (boolean): Default: false
*   `k_rack:_addition` (label): Default: undefined
*   `add-q1` (boolean): Default: false
*   `add-q2` (boolean): Default: false
*   `add-q3` (boolean): Default: false
*   `add-q4` (boolean): Default: false
*   `add-q5` (boolean): Default: false
*   `add-equals` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `add-counter1` (boolean): Default: false
*   `add_negate_all` (boolean): Default: false
*   `total_motor` (editableOptionShort): Default: [object Object],[object Object],[object Object]
*   `master_control_panel` (label): Default: undefined
*   `set_total` (number): Default: 0
*   `fast_step` (Enum: [, X1, X2, X3, X4, ...]): Default: ,X1,X2,X3,X4,X5,M37,M61,S1,S2,S3,S4,S5
*   `slow_step` (Enum: [, X1, X2, X3, X4, ...]): Default: ,X1,X2,X3,X4,X5,M37,M61,S1,S2,S3,S4,S5
*   `start_χ1` (number): Default: 1
*   `start_χ2` (number): Default: 1
*   `start_χ3` (number): Default: 1
*   `start_χ4` (number): Default: 1
*   `start_χ5` (number): Default: 1
*   `start_m61` (number): Default: 1
*   `start_m37` (number): Default: 1
*   `start_ψ1` (number): Default: 1
*   `start_ψ2` (number): Default: 1
*   `start_ψ3` (number): Default: 1
*   `start_ψ4` (number): Default: 1
*   `start_ψ5` (number): Default: 1

**Example:**
```json
{ "name": "cyberchef_colossus", "arguments": { "input": "..." } }
```

---

#### SIGABA (`cyberchef_sigaba`)
Encipher/decipher with the WW2 SIGABA machine. 

SIGABA, otherwise known as ECM Mark II, was used by the United States for message encryption during WW2 up to the 1950s. It was developed in the 1930s by the US Army and Navy, and has up to this day never been broken. Consisting of 15 rotors: 5 cipher rotors and 10 rotors (5 control rotors and 5 index rotors) controlling the stepping of the cipher rotors, the rotor stepping for SIGABA is much more complex than other rotor machines of its time, such as Enigma. All example rotor wirings are random example sets.

To configure rotor wirings, for the cipher and control rotors enter a string of letters which map from A to Z, and for the index rotors enter a sequence of numbers which map from 0 to 9. Note that encryption is not the same as decryption, so first choose the desired mode. 

 Note: Whilst this has been tested against other software emulators, it has not been tested against hardware.

**Arguments:**
*   `1st_(left-hand)_cipher_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `1st_cipher_rotor_reversed` (boolean): Default: false
*   `1st_cipher_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `2nd_cipher_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `2nd_cipher_rotor_reversed` (boolean): Default: false
*   `2nd_cipher_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `3rd_(middle)_cipher_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `3rd_cipher_rotor_reversed` (boolean): Default: false
*   `3rd_cipher_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `4th_cipher_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `4th_cipher_rotor_reversed` (boolean): Default: false
*   `4th_cipher_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `5th_(right-hand)_cipher_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `5th_cipher_rotor_reversed` (boolean): Default: false
*   `5th_cipher_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `1st_(left-hand)_control_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `1st_control_rotor_reversed` (boolean): Default: false
*   `1st_control_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `2nd_control_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `2nd_control_rotor_reversed` (boolean): Default: false
*   `2nd_control_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `3rd_(middle)_control_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `3rd_control_rotor_reversed` (boolean): Default: false
*   `3rd_control_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `4th_control_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `4th_control_rotor_reversed` (boolean): Default: false
*   `4th_control_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `5th_(right-hand)_control_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5, ...]): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `5th_control_rotor_reversed` (boolean): Default: false
*   `5th_control_rotor_initial_value` (Enum: [A, B, C, D, E, ...]): Default: A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z
*   `1st_(left-hand)_index_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5]): Default: [object Object],[object Object],[object Object],[object Object],[object Object]
*   `1st_index_rotor_initial_value` (Enum: [0, 1, 2, 3, 4, ...]): Default: 0,1,2,3,4,5,6,7,8,9
*   `2nd_index_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5]): Default: [object Object],[object Object],[object Object],[object Object],[object Object]
*   `2nd_index_rotor_initial_value` (Enum: [0, 1, 2, 3, 4, ...]): Default: 0,1,2,3,4,5,6,7,8,9
*   `3rd_(middle)_index_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5]): Default: [object Object],[object Object],[object Object],[object Object],[object Object]
*   `3rd_index_rotor_initial_value` (Enum: [0, 1, 2, 3, 4, ...]): Default: 0,1,2,3,4,5,6,7,8,9
*   `4th_index_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5]): Default: [object Object],[object Object],[object Object],[object Object],[object Object]
*   `4th_index_rotor_initial_value` (Enum: [0, 1, 2, 3, 4, ...]): Default: 0,1,2,3,4,5,6,7,8,9
*   `5th_(right-hand)_index_rotor` (Enum: [Example 1, Example 2, Example 3, Example 4, Example 5]): Default: [object Object],[object Object],[object Object],[object Object],[object Object]
*   `5th_index_rotor_initial_value` (Enum: [0, 1, 2, 3, 4, ...]): Default: 0,1,2,3,4,5,6,7,8,9
*   `sigaba_mode` (Enum: [Encrypt, Decrypt]): Default: Encrypt,Decrypt

**Example:**
```json
{ "name": "cyberchef_sigaba", "arguments": { "input": "..." } }
```

---

### Public Key

#### Parse X.509 certificate (`cyberchef_parse_x_509_certificate`)
X.509 is an ITU-T standard for a public key infrastructure (PKI) and Privilege Management Infrastructure (PMI). It is commonly involved with SSL/TLS security.

This operation displays the contents of a certificate in a human readable format, similar to the openssl command line tool.

Tags: X509, server hello, handshake

**Arguments:**
*   `input_format` (Enum: [PEM, DER Hex, Base64, Raw]): Default: PEM,DER Hex,Base64,Raw

**Example:**
```json
{ "name": "cyberchef_parse_x_509_certificate", "arguments": { "input": "..." } }
```

---

#### Parse X.509 CRL (`cyberchef_parse_x_509_crl`)
Parse Certificate Revocation List (CRL)

**Arguments:**
*   `input_format` (Enum: [PEM, DER Hex, Base64, Raw]): Default: PEM,DER Hex,Base64,Raw

**Example:**
```json
{ "name": "cyberchef_parse_x_509_crl", "arguments": { "input": "..." } }
```

---

#### Parse ASN.1 hex string (`cyberchef_parse_asn_1_hex_string`)
Abstract Syntax Notation One (ASN.1) is a standard and notation that describes rules and structures for representing, encoding, transmitting, and decoding data in telecommunications and computer networking.

This operation parses arbitrary ASN.1 data (encoded as an hex string: use the 'To Hex' operation if necessary) and presents the resulting tree.

**Arguments:**
*   `starting_index` (number): Default: 0
*   `truncate_octet_strings_longer_than` (number): Default: 32

**Example:**
```json
{ "name": "cyberchef_parse_asn_1_hex_string", "arguments": { "input": "..." } }
```

---

#### PEM to Hex (`cyberchef_pem_to_hex`)
Converts PEM (Privacy Enhanced Mail) format to a hexadecimal DER (Distinguished Encoding Rules) string.

**Example:**
```json
{ "name": "cyberchef_pem_to_hex", "arguments": { "input": "..." } }
```

---

#### Hex to PEM (`cyberchef_hex_to_pem`)
Converts a hexadecimal DER (Distinguished Encoding Rules) string into PEM (Privacy Enhanced Mail) format.

**Arguments:**
*   `header_string` (string): Default: CERTIFICATE

**Example:**
```json
{ "name": "cyberchef_hex_to_pem", "arguments": { "input": "..." } }
```

---

#### Hex to Object Identifier (`cyberchef_hex_to_object_identifier`)
Converts a hexadecimal string into an object identifier (OID).

**Example:**
```json
{ "name": "cyberchef_hex_to_object_identifier", "arguments": { "input": "..." } }
```

---

#### Object Identifier to Hex (`cyberchef_object_identifier_to_hex`)
Converts an object identifier (OID) into a hexadecimal string.

**Example:**
```json
{ "name": "cyberchef_object_identifier_to_hex", "arguments": { "input": "..." } }
```

---

#### PEM to JWK (`cyberchef_pem_to_jwk`)
Converts Keys in PEM format to a JSON Web Key format.

**Example:**
```json
{ "name": "cyberchef_pem_to_jwk", "arguments": { "input": "..." } }
```

---

#### JWK to PEM (`cyberchef_jwk_to_pem`)
Converts Keys in JSON Web Key format to PEM format (PKCS#8).

**Example:**
```json
{ "name": "cyberchef_jwk_to_pem", "arguments": { "input": "..." } }
```

---

#### Generate PGP Key Pair (`cyberchef_generate_pgp_key_pair`)
Generates a new public/private PGP key pair. Supports RSA and Eliptic Curve (EC) keys.

WARNING: Cryptographic operations in CyberChef should not be relied upon to provide security in any situation. No guarantee is offered for their correctness. We advise you not to use keys generated from CyberChef in operational contexts.

**Arguments:**
*   `key_type` (Enum: [RSA-1024, RSA-2048, RSA-4096, ECC-256, ECC-384, ...]): Default: RSA-1024,RSA-2048,RSA-4096,ECC-256,ECC-384,ECC-521
*   `password_(optional)` (string): Default: ""
*   `name_(optional)` (string): Default: ""
*   `email_(optional)` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_generate_pgp_key_pair", "arguments": { "input": "..." } }
```

---

#### PGP Encrypt (`cyberchef_pgp_encrypt`)
Input: the message you want to encrypt.



Arguments: the ASCII-armoured PGP public key of the recipient.



Pretty Good Privacy is an encryption standard (OpenPGP) used for encrypting, decrypting, and signing messages.



This function uses the Keybase implementation of PGP.

**Arguments:**
*   `public_key_of_recipient` (text): Default: ""

**Example:**
```json
{ "name": "cyberchef_pgp_encrypt", "arguments": { "input": "..." } }
```

---

#### PGP Decrypt (`cyberchef_pgp_decrypt`)
Input: the ASCII-armoured PGP message you want to decrypt.



Arguments: the ASCII-armoured PGP private key of the recipient, 
(and the private key password if necessary).



Pretty Good Privacy is an encryption standard (OpenPGP) used for encrypting, decrypting, and signing messages.



This function uses the Keybase implementation of PGP.

**Arguments:**
*   `private_key_of_recipient` (text): Default: ""
*   `private_key_passphrase` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_pgp_decrypt", "arguments": { "input": "..." } }
```

---

#### PGP Verify (`cyberchef_pgp_verify`)
Input: the ASCII-armoured encrypted PGP message you want to verify.



Argument: the ASCII-armoured PGP public key of the signer



This operation uses PGP to decrypt a clearsigned message.



Pretty Good Privacy is an encryption standard (OpenPGP) used for encrypting, decrypting, and signing messages.



This function uses the Keybase implementation of PGP.

**Arguments:**
*   `public_key_of_signer` (text): Default: ""

**Example:**
```json
{ "name": "cyberchef_pgp_verify", "arguments": { "input": "..." } }
```

---

#### PGP Encrypt and Sign (`cyberchef_pgp_encrypt_and_sign`)
Input: the cleartext you want to sign.



Arguments: the ASCII-armoured private key of the signer (plus the private key password if necessary)
and the ASCII-armoured PGP public key of the recipient.



This operation uses PGP to produce an encrypted digital signature.



Pretty Good Privacy is an encryption standard (OpenPGP) used for encrypting, decrypting, and signing messages.



This function uses the Keybase implementation of PGP.

**Arguments:**
*   `private_key_of_signer` (text): Default: ""
*   `private_key_passphrase` (string): Default: ""
*   `public_key_of_recipient` (text): Default: ""

**Example:**
```json
{ "name": "cyberchef_pgp_encrypt_and_sign", "arguments": { "input": "..." } }
```

---

#### PGP Decrypt and Verify (`cyberchef_pgp_decrypt_and_verify`)
Input: the ASCII-armoured encrypted PGP message you want to verify.



Arguments: the ASCII-armoured PGP public key of the signer, 
the ASCII-armoured private key of the recipient (and the private key password if necessary).



This operation uses PGP to decrypt and verify an encrypted digital signature.



Pretty Good Privacy is an encryption standard (OpenPGP) used for encrypting, decrypting, and signing messages.



This function uses the Keybase implementation of PGP.

**Arguments:**
*   `public_key_of_signer` (text): Default: ""
*   `private_key_of_recipient` (text): Default: ""
*   `private_key_password` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_pgp_decrypt_and_verify", "arguments": { "input": "..." } }
```

---

#### Generate RSA Key Pair (`cyberchef_generate_rsa_key_pair`)
Generate an RSA key pair with a given number of bits.

WARNING: Cryptographic operations in CyberChef should not be relied upon to provide security in any situation. No guarantee is offered for their correctness. We advise you not to use keys generated from CyberChef in operational contexts.

**Arguments:**
*   `rsa_key_length` (Enum: [1024, 2048, 4096]): Default: 1024,2048,4096
*   `output_format` (Enum: [PEM, JSON, DER]): Default: PEM,JSON,DER

**Example:**
```json
{ "name": "cyberchef_generate_rsa_key_pair", "arguments": { "input": "..." } }
```

---

#### RSA Sign (`cyberchef_rsa_sign`)
Sign a plaintext message with a PEM encoded RSA key.

**Arguments:**
*   `rsa_private_key_(pem)` (text): Default: -----BEGIN RSA PRIVATE KEY-----
*   `key_password` (text): Default: ""
*   `message_digest_algorithm` (Enum: [SHA-1, MD5, SHA-256, SHA-384, SHA-512]): Default: SHA-1,MD5,SHA-256,SHA-384,SHA-512

**Example:**
```json
{ "name": "cyberchef_rsa_sign", "arguments": { "input": "..." } }
```

---

#### RSA Verify (`cyberchef_rsa_verify`)
Verify a message against a signature and a public PEM encoded RSA key.

**Arguments:**
*   `rsa_public_key_(pem)` (text): Default: -----BEGIN RSA PUBLIC KEY-----
*   `message` (text): Default: ""
*   `message_format` (Enum: [Raw, Hex, Base64]): Default: Raw,Hex,Base64
*   `message_digest_algorithm` (Enum: [SHA-1, MD5, SHA-256, SHA-384, SHA-512]): Default: SHA-1,MD5,SHA-256,SHA-384,SHA-512

**Example:**
```json
{ "name": "cyberchef_rsa_verify", "arguments": { "input": "..." } }
```

---

#### RSA Encrypt (`cyberchef_rsa_encrypt`)
Encrypt a message with a PEM encoded RSA public key.

**Arguments:**
*   `rsa_public_key_(pem)` (text): Default: -----BEGIN RSA PUBLIC KEY-----
*   `encryption_scheme` (argSelector): Default: [object Object],[object Object],[object Object]
*   `message_digest_algorithm` (Enum: [SHA-1, MD5, SHA-256, SHA-384, SHA-512]): Default: SHA-1,MD5,SHA-256,SHA-384,SHA-512

**Example:**
```json
{ "name": "cyberchef_rsa_encrypt", "arguments": { "input": "..." } }
```

---

#### RSA Decrypt (`cyberchef_rsa_decrypt`)
Decrypt an RSA encrypted message with a PEM encoded private key.

**Arguments:**
*   `rsa_private_key_(pem)` (text): Default: -----BEGIN RSA PRIVATE KEY-----
*   `key_password` (text): Default: ""
*   `encryption_scheme` (argSelector): Default: [object Object],[object Object],[object Object]
*   `message_digest_algorithm` (Enum: [SHA-1, MD5, SHA-256, SHA-384, SHA-512]): Default: SHA-1,MD5,SHA-256,SHA-384,SHA-512

**Example:**
```json
{ "name": "cyberchef_rsa_decrypt", "arguments": { "input": "..." } }
```

---

#### Generate ECDSA Key Pair (`cyberchef_generate_ecdsa_key_pair`)
Generate an ECDSA key pair with a given Curve.

WARNING: Cryptographic operations in CyberChef should not be relied upon to provide security in any situation. No guarantee is offered for their correctness. We advise you not to use keys generated from CyberChef in operational contexts.

**Arguments:**
*   `elliptic_curve` (Enum: [P-256, P-384, P-521]): Default: P-256,P-384,P-521
*   `output_format` (Enum: [PEM, DER, JWK]): Default: PEM,DER,JWK

**Example:**
```json
{ "name": "cyberchef_generate_ecdsa_key_pair", "arguments": { "input": "..." } }
```

---

#### ECDSA Signature Conversion (`cyberchef_ecdsa_signature_conversion`)
Convert an ECDSA signature between hex, asn1 and json.

**Arguments:**
*   `input_format` (Enum: [Auto, ASN.1 HEX, P1363 HEX, JSON Web Signature, Raw JSON]): Default: Auto,ASN.1 HEX,P1363 HEX,JSON Web Signature,Raw JSON
*   `output_format` (Enum: [ASN.1 HEX, P1363 HEX, JSON Web Signature, Raw JSON]): Default: ASN.1 HEX,P1363 HEX,JSON Web Signature,Raw JSON

**Example:**
```json
{ "name": "cyberchef_ecdsa_signature_conversion", "arguments": { "input": "..." } }
```

---

#### ECDSA Sign (`cyberchef_ecdsa_sign`)
Sign a plaintext message with a PEM encoded EC key.

**Arguments:**
*   `ecdsa_private_key_(pem)` (text): Default: -----BEGIN EC PRIVATE KEY-----
*   `message_digest_algorithm` (Enum: [SHA-256, SHA-384, SHA-512, SHA-1, MD5]): Default: SHA-256,SHA-384,SHA-512,SHA-1,MD5
*   `output_format` (Enum: [ASN.1 HEX, P1363 HEX, JSON Web Signature, Raw JSON]): Default: ASN.1 HEX,P1363 HEX,JSON Web Signature,Raw JSON

**Example:**
```json
{ "name": "cyberchef_ecdsa_sign", "arguments": { "input": "..." } }
```

---

#### ECDSA Verify (`cyberchef_ecdsa_verify`)
Verify a message against a signature and a public PEM encoded EC key.

**Arguments:**
*   `input_format` (Enum: [Auto, ASN.1 HEX, P1363 HEX, JSON Web Signature, Raw JSON]): Default: Auto,ASN.1 HEX,P1363 HEX,JSON Web Signature,Raw JSON
*   `message_digest_algorithm` (Enum: [SHA-256, SHA-384, SHA-512, SHA-1, MD5]): Default: SHA-256,SHA-384,SHA-512,SHA-1,MD5
*   `ecdsa_public_key_(pem)` (text): Default: -----BEGIN PUBLIC KEY-----
*   `message` (text): Default: ""
*   `message_format` (Enum: [Raw, Hex, Base64]): Default: Raw,Hex,Base64

**Example:**
```json
{ "name": "cyberchef_ecdsa_verify", "arguments": { "input": "..." } }
```

---

#### Parse SSH Host Key (`cyberchef_parse_ssh_host_key`)
Parses a SSH host key and extracts fields from it.
The key type can be:ssh-rsassh-dssecdsa-sha2ssh-ed25519The key format can be either Hex or Base64.

**Arguments:**
*   `input_format` (Enum: [Auto, Base64, Hex]): Default: Auto,Base64,Hex

**Example:**
```json
{ "name": "cyberchef_parse_ssh_host_key", "arguments": { "input": "..." } }
```

---

#### Parse CSR (`cyberchef_parse_csr`)
Parse Certificate Signing Request (CSR) for an X.509 certificate

**Arguments:**
*   `input_format` (Enum: [PEM]): Default: PEM

**Example:**
```json
{ "name": "cyberchef_parse_csr", "arguments": { "input": "..." } }
```

---

#### Public Key from Certificate (`cyberchef_public_key_from_certificate`)
Extracts the Public Key from a Certificate.

**Example:**
```json
{ "name": "cyberchef_public_key_from_certificate", "arguments": { "input": "..." } }
```

---

#### Public Key from Private Key (`cyberchef_public_key_from_private_key`)
Extracts the Public Key from a Private Key.

**Example:**
```json
{ "name": "cyberchef_public_key_from_private_key", "arguments": { "input": "..." } }
```

---

#### SM2 Encrypt (`cyberchef_sm2_encrypt`)
Encrypts a message utilizing the SM2 standard

**Arguments:**
*   `public_key_x` (string): Default: DEADBEEF
*   `public_key_y` (string): Default: DEADBEEF
*   `output_format` (Enum: [C1C3C2, C1C2C3]): Default: C1C3C2,C1C2C3
*   `curve` (Enum: [sm2p256v1]): Default: sm2p256v1

**Example:**
```json
{ "name": "cyberchef_sm2_encrypt", "arguments": { "input": "..." } }
```

---

#### SM2 Decrypt (`cyberchef_sm2_decrypt`)
Decrypts a message utilizing the SM2 standard

**Arguments:**
*   `private_key` (string): Default: DEADBEEF
*   `input_format` (Enum: [C1C3C2, C1C2C3]): Default: C1C3C2,C1C2C3
*   `curve` (Enum: [sm2p256v1]): Default: sm2p256v1

**Example:**
```json
{ "name": "cyberchef_sm2_decrypt", "arguments": { "input": "..." } }
```

---

### Arithmetic / Logic

#### Set Union (`cyberchef_set_union`)
Calculates the union of two sets.

**Arguments:**
*   `sample_delimiter` (binaryString): Default: \n\n
*   `item_delimiter` (binaryString): Default: ,

**Example:**
```json
{ "name": "cyberchef_set_union", "arguments": { "input": "..." } }
```

---

#### Set Intersection (`cyberchef_set_intersection`)
Calculates the intersection of two sets.

**Arguments:**
*   `sample_delimiter` (binaryString): Default: \n\n
*   `item_delimiter` (binaryString): Default: ,

**Example:**
```json
{ "name": "cyberchef_set_intersection", "arguments": { "input": "..." } }
```

---

#### Set Difference (`cyberchef_set_difference`)
Calculates the difference, or relative complement, of two sets.

**Arguments:**
*   `sample_delimiter` (binaryString): Default: \n\n
*   `item_delimiter` (binaryString): Default: ,

**Example:**
```json
{ "name": "cyberchef_set_difference", "arguments": { "input": "..." } }
```

---

#### Symmetric Difference (`cyberchef_symmetric_difference`)
Calculates the symmetric difference of two sets.

**Arguments:**
*   `sample_delimiter` (binaryString): Default: \n\n
*   `item_delimiter` (binaryString): Default: ,

**Example:**
```json
{ "name": "cyberchef_symmetric_difference", "arguments": { "input": "..." } }
```

---

#### Cartesian Product (`cyberchef_cartesian_product`)
Calculates the cartesian product of multiple sets of data, returning all possible combinations.

**Arguments:**
*   `sample_delimiter` (binaryString): Default: \n\n
*   `item_delimiter` (binaryString): Default: ,

**Example:**
```json
{ "name": "cyberchef_cartesian_product", "arguments": { "input": "..." } }
```

---

#### Power Set (`cyberchef_power_set`)
Calculates all the subsets of a set.

**Arguments:**
*   `item_delimiter` (binaryString): Default: ,

**Example:**
```json
{ "name": "cyberchef_power_set", "arguments": { "input": "..." } }
```

---

#### XOR (`cyberchef_xor`)
XOR the input with the given key.
e.g. fe023da5

Options
Null preserving: If the current byte is 0x00 or the same as the key, skip it.

Scheme:Standard - key is unchanged after each roundInput differential - key is set to the value of the previous unprocessed byteOutput differential - key is set to the value of the previous processed byteCascade - key is set to the input byte shifted by one

**Arguments:**
*   `key` (toggleString): Default: ""
*   `scheme` (Enum: [Standard, Input differential, Output differential, Cascade]): Default: Standard,Input differential,Output differential,Cascade
*   `null_preserving` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_xor", "arguments": { "input": "..." } }
```

---

#### XOR Brute Force (`cyberchef_xor_brute_force`)
Enumerate all possible XOR solutions. Current maximum key length is 2 due to browser performance.

Optionally enter a string that you expect to find in the plaintext to filter results (crib).

**Arguments:**
*   `key_length` (number): Default: 1
*   `sample_length` (number): Default: 100
*   `sample_offset` (number): Default: 0
*   `scheme` (Enum: [Standard, Input differential, Output differential]): Default: Standard,Input differential,Output differential
*   `null_preserving` (boolean): Default: false
*   `print_key` (boolean): Default: true
*   `output_as_hex` (boolean): Default: false
*   `crib_(known_plaintext_string)` (binaryString): Default: ""

**Example:**
```json
{ "name": "cyberchef_xor_brute_force", "arguments": { "input": "..." } }
```

---

#### OR (`cyberchef_or`)
OR the input with the given key.
e.g. fe023da5

**Arguments:**
*   `key` (toggleString): Default: ""

**Example:**
```json
{ "name": "cyberchef_or", "arguments": { "input": "..." } }
```

---

#### NOT (`cyberchef_not`)
Returns the inverse of each byte.

**Example:**
```json
{ "name": "cyberchef_not", "arguments": { "input": "..." } }
```

---

#### AND (`cyberchef_and`)
AND the input with the given key.
e.g. fe023da5

**Arguments:**
*   `key` (toggleString): Default: ""

**Example:**
```json
{ "name": "cyberchef_and", "arguments": { "input": "..." } }
```

---

#### ADD (`cyberchef_add`)
ADD the input with the given key (e.g. fe023da5), MOD 255

**Arguments:**
*   `key` (toggleString): Default: ""

**Example:**
```json
{ "name": "cyberchef_add", "arguments": { "input": "..." } }
```

---

#### SUB (`cyberchef_sub`)
SUB the input with the given key (e.g. fe023da5), MOD 255

**Arguments:**
*   `key` (toggleString): Default: ""

**Example:**
```json
{ "name": "cyberchef_sub", "arguments": { "input": "..." } }
```

---

#### Sum (`cyberchef_sum`)
Adds together a list of numbers. If an item in the string is not a number it is excluded from the list.

e.g. 0x0a 8 .5 becomes 18.5

**Arguments:**
*   `delimiter` (Enum: [Line feed, Space, Comma, Semi-colon, Colon, ...]): Default: Line feed,Space,Comma,Semi-colon,Colon,CRLF

**Example:**
```json
{ "name": "cyberchef_sum", "arguments": { "input": "..." } }
```

---

#### Subtract (`cyberchef_subtract`)
Subtracts a list of numbers. If an item in the string is not a number it is excluded from the list.

e.g. 0x0a 8 .5 becomes 1.5

**Arguments:**
*   `delimiter` (Enum: [Line feed, Space, Comma, Semi-colon, Colon, ...]): Default: Line feed,Space,Comma,Semi-colon,Colon,CRLF

**Example:**
```json
{ "name": "cyberchef_subtract", "arguments": { "input": "..." } }
```

---

#### Multiply (`cyberchef_multiply`)
Multiplies a list of numbers. If an item in the string is not a number it is excluded from the list.

e.g. 0x0a 8 .5 becomes 40

**Arguments:**
*   `delimiter` (Enum: [Line feed, Space, Comma, Semi-colon, Colon, ...]): Default: Line feed,Space,Comma,Semi-colon,Colon,CRLF

**Example:**
```json
{ "name": "cyberchef_multiply", "arguments": { "input": "..." } }
```

---

#### Divide (`cyberchef_divide`)
Divides a list of numbers. If an item in the string is not a number it is excluded from the list.

e.g. 0x0a 8 .5 becomes 2.5

**Arguments:**
*   `delimiter` (Enum: [Line feed, Space, Comma, Semi-colon, Colon, ...]): Default: Line feed,Space,Comma,Semi-colon,Colon,CRLF

**Example:**
```json
{ "name": "cyberchef_divide", "arguments": { "input": "..." } }
```

---

#### Mean (`cyberchef_mean`)
Computes the mean (average) of a number list. If an item in the string is not a number it is excluded from the list.

e.g. 0x0a 8 .5 .5 becomes 4.75

**Arguments:**
*   `delimiter` (Enum: [Line feed, Space, Comma, Semi-colon, Colon, ...]): Default: Line feed,Space,Comma,Semi-colon,Colon,CRLF

**Example:**
```json
{ "name": "cyberchef_mean", "arguments": { "input": "..." } }
```

---

#### Median (`cyberchef_median`)
Computes the median of a number list. If an item in the string is not a number it is excluded from the list.

e.g. 0x0a 8 1 .5 becomes 4.5

**Arguments:**
*   `delimiter` (Enum: [Line feed, Space, Comma, Semi-colon, Colon, ...]): Default: Line feed,Space,Comma,Semi-colon,Colon,CRLF

**Example:**
```json
{ "name": "cyberchef_median", "arguments": { "input": "..." } }
```

---

#### Standard Deviation (`cyberchef_standard_deviation`)
Computes the standard deviation of a number list. If an item in the string is not a number it is excluded from the list.

e.g. 0x0a 8 .5 becomes 4.089281382128433

**Arguments:**
*   `delimiter` (Enum: [Line feed, Space, Comma, Semi-colon, Colon, ...]): Default: Line feed,Space,Comma,Semi-colon,Colon,CRLF

**Example:**
```json
{ "name": "cyberchef_standard_deviation", "arguments": { "input": "..." } }
```

---

#### Bit shift left (`cyberchef_bit_shift_left`)
Shifts the bits in each byte towards the left by the specified amount.

**Arguments:**
*   `amount` (number): Default: 1

**Example:**
```json
{ "name": "cyberchef_bit_shift_left", "arguments": { "input": "..." } }
```

---

#### Bit shift right (`cyberchef_bit_shift_right`)
Shifts the bits in each byte towards the right by the specified amount.

Logical shifts replace the leftmost bits with zeros.
Arithmetic shifts preserve the most significant bit (MSB) of the original byte keeping the sign the same (positive or negative).

**Arguments:**
*   `amount` (number): Default: 1
*   `type` (Enum: [Logical shift, Arithmetic shift]): Default: Logical shift,Arithmetic shift

**Example:**
```json
{ "name": "cyberchef_bit_shift_right", "arguments": { "input": "..." } }
```

---

#### Rotate left (`cyberchef_rotate_left`)
Rotates each byte to the left by the number of bits specified, optionally carrying the excess bits over to the next byte. Currently only supports 8-bit values.

**Arguments:**
*   `amount` (number): Default: 1
*   `carry_through` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_rotate_left", "arguments": { "input": "..." } }
```

---

#### Rotate right (`cyberchef_rotate_right`)
Rotates each byte to the right by the number of bits specified, optionally carrying the excess bits over to the next byte. Currently only supports 8-bit values.

**Arguments:**
*   `amount` (number): Default: 1
*   `carry_through` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_rotate_right", "arguments": { "input": "..." } }
```

---

#### ROT13 (`cyberchef_rot13`)
A simple caesar substitution cipher which rotates alphabet characters by the specified amount (default 13).

**Arguments:**
*   `rotate_lower_case_chars` (boolean): Default: true
*   `rotate_upper_case_chars` (boolean): Default: true
*   `rotate_numbers` (boolean): Default: false
*   `amount` (number): Default: 13

**Example:**
```json
{ "name": "cyberchef_rot13", "arguments": { "input": "..." } }
```

---

#### ROT8000 (`cyberchef_rot8000`)
The simple Caesar-cypher encryption that replaces each Unicode character with the one 0x8000 places forward or back along the alphabet.

**Example:**
```json
{ "name": "cyberchef_rot8000", "arguments": { "input": "..." } }
```

---

### Networking

#### HTTP request (`cyberchef_http_request`)
Makes an HTTP request and returns the response.



This operation supports different HTTP verbs like GET, POST, PUT, etc.



You can add headers line by line in the format Key: Value



The status code of the response, along with a limited selection of exposed headers, can be viewed by checking the 'Show response metadata' option. Only a limited set of response headers are exposed by the browser for security reasons.

**Arguments:**
*   `method` (Enum: [GET, POST, HEAD, PUT, PATCH, ...]): Default: GET,POST,HEAD,PUT,PATCH,DELETE,CONNECT,TRACE,OPTIONS
*   `url` (string): Default: ""
*   `headers` (text): Default: ""
*   `mode` (Enum: [Cross-Origin Resource Sharing, No CORS (limited to HEAD, GET or POST)]): Default: Cross-Origin Resource Sharing,No CORS (limited to HEAD, GET or POST)
*   `show_response_metadata` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_http_request", "arguments": { "input": "..." } }
```

---

#### DNS over HTTPS (`cyberchef_dns_over_https`)
Takes a single domain name and performs a DNS lookup using DNS over HTTPS.



By default, Cloudflare and Google DNS over HTTPS services are supported.



Can be used with any service that supports the GET parameters name and type.

**Arguments:**
*   `resolver` (Enum: [Google, Cloudflare]): Default: [object Object],[object Object]
*   `request_type` (Enum: [A, AAAA, ANAME, CERT, CNAME, ...]): Default: A,AAAA,ANAME,CERT,CNAME,DNSKEY,HTTPS,IPSECKEY,LOC,MX,NS,OPENPGPKEY,PTR,RRSIG,SIG,SOA,SPF,SRV,SSHFP,TA,TXT,URI,ANY
*   `answer_data_only` (boolean): Default: false
*   `disable_dnssec_validation` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_dns_over_https", "arguments": { "input": "..." } }
```

---

#### Strip HTTP headers (`cyberchef_strip_http_headers`)
Removes HTTP headers from a request or response by looking for the first instance of a double newline.

**Example:**
```json
{ "name": "cyberchef_strip_http_headers", "arguments": { "input": "..." } }
```

---

#### Dechunk HTTP response (`cyberchef_dechunk_http_response`)
Parses an HTTP response transferred using Transfer-Encoding: Chunked

**Example:**
```json
{ "name": "cyberchef_dechunk_http_response", "arguments": { "input": "..." } }
```

---

#### Parse User Agent (`cyberchef_parse_user_agent`)
Attempts to identify and categorise information contained in a user-agent string.

**Example:**
```json
{ "name": "cyberchef_parse_user_agent", "arguments": { "input": "..." } }
```

---

#### Parse IP range (`cyberchef_parse_ip_range`)
Given a CIDR range (e.g. 10.0.0.0/24), hyphenated range (e.g. 10.0.0.0 - 10.0.1.0), or a list of IPs and/or CIDR ranges (separated by a new line), this operation provides network information and enumerates all IP addresses in the range.

IPv6 is supported but will not be enumerated.

**Arguments:**
*   `include_network_info` (boolean): Default: true
*   `enumerate_ip_addresses` (boolean): Default: true
*   `allow_large_queries` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_parse_ip_range", "arguments": { "input": "..." } }
```

---

#### Parse IPv6 address (`cyberchef_parse_ipv6_address`)
Displays the longhand and shorthand versions of a valid IPv6 address.

Recognises all reserved ranges and parses encapsulated or tunnelled addresses including Teredo and 6to4.

**Example:**
```json
{ "name": "cyberchef_parse_ipv6_address", "arguments": { "input": "..." } }
```

---

#### IPv6 Transition Addresses (`cyberchef_ipv6_transition_addresses`)
Converts IPv4 addresses to their IPv6 Transition addresses. IPv6 Transition addresses can also be converted back into their original IPv4 address. MAC addresses can also be converted into the EUI-64 format, this can them be appended to your IPv6 /64 range to obtain a full /128 address.

Transition technologies enable translation between IPv4 and IPv6 addresses or tunneling to allow traffic to pass through the incompatible network, allowing the two standards to coexist.

Only /24 ranges and currently handled. Remove headers to easily copy out results.

**Arguments:**
*   `ignore_ranges` (boolean): Default: true
*   `remove_headers` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_ipv6_transition_addresses", "arguments": { "input": "..." } }
```

---

#### Parse IPv4 header (`cyberchef_parse_ipv4_header`)
Given an IPv4 header, this operations parses and displays each field in an easily readable format.

**Arguments:**
*   `input_format` (Enum: [Hex, Raw]): Default: Hex,Raw

**Example:**
```json
{ "name": "cyberchef_parse_ipv4_header", "arguments": { "input": "..." } }
```

---

#### Strip IPv4 header (`cyberchef_strip_ipv4_header`)
Strips the IPv4 header from an IPv4 packet, outputting the payload.

**Example:**
```json
{ "name": "cyberchef_strip_ipv4_header", "arguments": { "input": "..." } }
```

---

#### Parse TCP (`cyberchef_parse_tcp`)
Parses a TCP header and payload (if present).

**Arguments:**
*   `input_format` (Enum: [Hex, Raw]): Default: Hex,Raw

**Example:**
```json
{ "name": "cyberchef_parse_tcp", "arguments": { "input": "..." } }
```

---

#### Strip TCP header (`cyberchef_strip_tcp_header`)
Strips the TCP header from a TCP segment, outputting the payload.

**Example:**
```json
{ "name": "cyberchef_strip_tcp_header", "arguments": { "input": "..." } }
```

---

#### Parse TLS record (`cyberchef_parse_tls_record`)
Parses one or more TLS records

**Example:**
```json
{ "name": "cyberchef_parse_tls_record", "arguments": { "input": "..." } }
```

---

#### Parse UDP (`cyberchef_parse_udp`)
Parses a UDP header and payload (if present).

**Arguments:**
*   `input_format` (Enum: [Hex, Raw]): Default: Hex,Raw

**Example:**
```json
{ "name": "cyberchef_parse_udp", "arguments": { "input": "..." } }
```

---

#### Strip UDP header (`cyberchef_strip_udp_header`)
Strips the UDP header from a UDP datagram, outputting the payload.

**Example:**
```json
{ "name": "cyberchef_strip_udp_header", "arguments": { "input": "..." } }
```

---

#### Parse SSH Host Key (`cyberchef_parse_ssh_host_key`)
Parses a SSH host key and extracts fields from it.
The key type can be:ssh-rsassh-dssecdsa-sha2ssh-ed25519The key format can be either Hex or Base64.

**Arguments:**
*   `input_format` (Enum: [Auto, Base64, Hex]): Default: Auto,Base64,Hex

**Example:**
```json
{ "name": "cyberchef_parse_ssh_host_key", "arguments": { "input": "..." } }
```

---

#### Parse URI (`cyberchef_parse_uri`)
Pretty prints complicated Uniform Resource Identifier (URI) strings for ease of reading. Particularly useful for Uniform Resource Locators (URLs) with a lot of arguments.

**Example:**
```json
{ "name": "cyberchef_parse_uri", "arguments": { "input": "..." } }
```

---

#### URL Encode (`cyberchef_url_encode`)
Encodes problematic characters into percent-encoding, a format supported by URIs/URLs.

e.g. = becomes %3d

**Arguments:**
*   `encode_all_special_chars` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_url_encode", "arguments": { "input": "..." } }
```

---

#### URL Decode (`cyberchef_url_decode`)
Converts URI/URL percent-encoded characters back to their raw values.

e.g. %3d becomes =

**Arguments:**
*   `treat_"+"_as_space` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_url_decode", "arguments": { "input": "..." } }
```

---

#### Protobuf Decode (`cyberchef_protobuf_decode`)
Decodes any Protobuf encoded data to a JSON representation of the data using the field number as the field key.

If a .proto schema is defined, the encoded data will be decoded with reference to the schema. Only one message instance will be decoded. 

Show Unknown Fields
When a schema is used, this option shows fields that are present in the input data but not defined in the schema.

Show Types
Show the type of a field next to its name. For undefined fields, the wiretype and example types are shown instead.

**Arguments:**
*   `schema_(.proto_text)` (text): Default: ""
*   `show_unknown_fields` (boolean): Default: false
*   `show_types` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_protobuf_decode", "arguments": { "input": "..." } }
```

---

#### Protobuf Encode (`cyberchef_protobuf_encode`)
Encodes a valid JSON object into a protobuf byte array using the input .proto schema.

**Arguments:**
*   `schema_(.proto_text)` (text): Default: ""

**Example:**
```json
{ "name": "cyberchef_protobuf_encode", "arguments": { "input": "..." } }
```

---

#### VarInt Encode (`cyberchef_varint_encode`)
Encodes a Vn integer as a VarInt. VarInt is an efficient way of encoding variable length integers and is commonly used with Protobuf.

**Example:**
```json
{ "name": "cyberchef_varint_encode", "arguments": { "input": "..." } }
```

---

#### VarInt Decode (`cyberchef_varint_decode`)
Decodes a VarInt encoded integer. VarInt is an efficient way of encoding variable length integers and is commonly used with Protobuf.

**Example:**
```json
{ "name": "cyberchef_varint_decode", "arguments": { "input": "..." } }
```

---

#### JA3 Fingerprint (`cyberchef_ja3_fingerprint`)
Generates a JA3 fingerprint to help identify TLS clients based on hashing together values from the Client Hello.

Input: A hex stream of the TLS Client Hello packet application layer.

**Arguments:**
*   `input_format` (Enum: [Hex, Base64, Raw]): Default: Hex,Base64,Raw
*   `output_format` (Enum: [Hash digest, JA3 string, Full details]): Default: Hash digest,JA3 string,Full details

**Example:**
```json
{ "name": "cyberchef_ja3_fingerprint", "arguments": { "input": "..." } }
```

---

#### JA3S Fingerprint (`cyberchef_ja3s_fingerprint`)
Generates a JA3S fingerprint to help identify TLS servers based on hashing together values from the Server Hello.

Input: A hex stream of the TLS Server Hello record application layer.

**Arguments:**
*   `input_format` (Enum: [Hex, Base64, Raw]): Default: Hex,Base64,Raw
*   `output_format` (Enum: [Hash digest, JA3S string, Full details]): Default: Hash digest,JA3S string,Full details

**Example:**
```json
{ "name": "cyberchef_ja3s_fingerprint", "arguments": { "input": "..." } }
```

---

#### JA4 Fingerprint (`cyberchef_ja4_fingerprint`)
Generates a JA4 fingerprint to help identify TLS clients based on hashing together values from the Client Hello.

Input: A hex stream of the TLS or QUIC Client Hello packet application layer.

**Arguments:**
*   `input_format` (Enum: [Hex, Base64, Raw]): Default: Hex,Base64,Raw
*   `output_format` (Enum: [JA4, JA4 Original Rendering, JA4 Raw, JA4 Raw Original Rendering, All]): Default: JA4,JA4 Original Rendering,JA4 Raw,JA4 Raw Original Rendering,All

**Example:**
```json
{ "name": "cyberchef_ja4_fingerprint", "arguments": { "input": "..." } }
```

---

#### JA4Server Fingerprint (`cyberchef_ja4server_fingerprint`)
Generates a JA4Server Fingerprint (JA4S) to help identify TLS servers or sessions based on hashing together values from the Server Hello.

Input: A hex stream of the TLS or QUIC Server Hello packet application layer.

**Arguments:**
*   `input_format` (Enum: [Hex, Base64, Raw]): Default: Hex,Base64,Raw
*   `output_format` (Enum: [JA4S, JA4S Raw, Both]): Default: JA4S,JA4S Raw,Both

**Example:**
```json
{ "name": "cyberchef_ja4server_fingerprint", "arguments": { "input": "..." } }
```

---

#### HASSH Client Fingerprint (`cyberchef_hassh_client_fingerprint`)
Generates a HASSH fingerprint to help identify SSH clients based on hashing together values from the Client Key Exchange Init message.

Input: A hex stream of the SSH_MSG_KEXINIT packet application layer from Client to Server.

**Arguments:**
*   `input_format` (Enum: [Hex, Base64, Raw]): Default: Hex,Base64,Raw
*   `output_format` (Enum: [Hash digest, HASSH algorithms string, Full details]): Default: Hash digest,HASSH algorithms string,Full details

**Example:**
```json
{ "name": "cyberchef_hassh_client_fingerprint", "arguments": { "input": "..." } }
```

---

#### HASSH Server Fingerprint (`cyberchef_hassh_server_fingerprint`)
Generates a HASSH fingerprint to help identify SSH servers based on hashing together values from the Server Key Exchange Init message.

Input: A hex stream of the SSH_MSG_KEXINIT packet application layer from Server to Client.

**Arguments:**
*   `input_format` (Enum: [Hex, Base64, Raw]): Default: Hex,Base64,Raw
*   `output_format` (Enum: [Hash digest, HASSH algorithms string, Full details]): Default: Hash digest,HASSH algorithms string,Full details

**Example:**
```json
{ "name": "cyberchef_hassh_server_fingerprint", "arguments": { "input": "..." } }
```

---

#### Format MAC addresses (`cyberchef_format_mac_addresses`)
Displays given MAC addresses in multiple different formats.

Expects addresses in a list separated by newlines, spaces or commas.

WARNING: There are no validity checks.

**Arguments:**
*   `output_case` (Enum: [Both, Upper only, Lower only]): Default: Both,Upper only,Lower only
*   `no_delimiter` (boolean): Default: true
*   `dash_delimiter` (boolean): Default: true
*   `colon_delimiter` (boolean): Default: true
*   `cisco_style` (boolean): Default: false
*   `ipv6_interface_id` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_format_mac_addresses", "arguments": { "input": "..." } }
```

---

#### Change IP format (`cyberchef_change_ip_format`)
Convert an IP address from one format to another, e.g. 172.20.23.54 to ac141736

**Arguments:**
*   `input_format` (Enum: [Dotted Decimal, Decimal, Octal, Hex]): Default: Dotted Decimal,Decimal,Octal,Hex
*   `output_format` (Enum: [Dotted Decimal, Decimal, Octal, Hex]): Default: Dotted Decimal,Decimal,Octal,Hex

**Example:**
```json
{ "name": "cyberchef_change_ip_format", "arguments": { "input": "..." } }
```

---

#### Group IP addresses (`cyberchef_group_ip_addresses`)
Groups a list of IP addresses into subnets. Supports both IPv4 and IPv6 addresses.

**Arguments:**
*   `delimiter` (Enum: [Line feed, CRLF, Space, Comma, Semi-colon]): Default: Line feed,CRLF,Space,Comma,Semi-colon
*   `subnet_(cidr)` (number): Default: 24
*   `only_show_the_subnets` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_group_ip_addresses", "arguments": { "input": "..." } }
```

---

#### Encode NetBIOS Name (`cyberchef_encode_netbios_name`)
NetBIOS names as seen across the client interface to NetBIOS are exactly 16 bytes long. Within the NetBIOS-over-TCP protocols, a longer representation is used.

There are two levels of encoding. The first level maps a NetBIOS name into a domain system name.  The second level maps the domain system name into the 'compressed' representation required for interaction with the domain name system.

This operation carries out the first level of encoding. See RFC 1001 for full details.

**Arguments:**
*   `offset` (number): Default: 65

**Example:**
```json
{ "name": "cyberchef_encode_netbios_name", "arguments": { "input": "..." } }
```

---

#### Decode NetBIOS Name (`cyberchef_decode_netbios_name`)
NetBIOS names as seen across the client interface to NetBIOS are exactly 16 bytes long. Within the NetBIOS-over-TCP protocols, a longer representation is used.

There are two levels of encoding. The first level maps a NetBIOS name into a domain system name.  The second level maps the domain system name into the 'compressed' representation required for interaction with the domain name system.

This operation decodes the first level of encoding. See RFC 1001 for full details.

**Arguments:**
*   `offset` (number): Default: 65

**Example:**
```json
{ "name": "cyberchef_decode_netbios_name", "arguments": { "input": "..." } }
```

---

#### Defang URL (`cyberchef_defang_url`)
Takes a Universal Resource Locator (URL) and 'Defangs' it; meaning the URL becomes invalid, neutralising the risk of accidentally clicking on a malicious link.

This is often used when dealing with malicious links or IOCs.

Works well when combined with the 'Extract URLs' operation.

**Arguments:**
*   `escape_dots` (boolean): Default: true
*   `escape_http` (boolean): Default: true
*   `escape_://` (boolean): Default: true
*   `process` (Enum: [Valid domains and full URLs, Only full URLs, Everything]): Default: Valid domains and full URLs,Only full URLs,Everything

**Example:**
```json
{ "name": "cyberchef_defang_url", "arguments": { "input": "..." } }
```

---

#### Fang URL (`cyberchef_fang_url`)
Takes a 'Defanged' Universal Resource Locator (URL) and 'Fangs' it. Meaning, it removes the alterations (defanged) that render it useless so that it can be used again.

**Arguments:**
*   `restore_[.]` (boolean): Default: true
*   `restore_hxxp` (boolean): Default: true
*   `restore_://` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_fang_url", "arguments": { "input": "..." } }
```

---

#### Defang IP Addresses (`cyberchef_defang_ip_addresses`)
Takes a IPv4 or IPv6 address and 'Defangs' it, meaning the IP becomes invalid, removing the risk of accidentally utilising it as an IP address.

**Example:**
```json
{ "name": "cyberchef_defang_ip_addresses", "arguments": { "input": "..." } }
```

---

### Language

#### Encode text (`cyberchef_encode_text`)
Encodes text into the chosen character encoding.



Supported charsets are:

UTF-8 (65001)
UTF-7 (65000)
UTF-16LE (1200)
UTF-16BE (1201)
UTF-32LE (12000)
UTF-32BE (12001)
IBM EBCDIC International (500)
IBM EBCDIC US-Canada (37)
IBM EBCDIC Multilingual/ROECE (Latin 2) (870)
IBM EBCDIC Greek Modern (875)
IBM EBCDIC French (1010)
IBM EBCDIC Turkish (Latin 5) (1026)
IBM EBCDIC Latin 1/Open System (1047)
IBM EBCDIC Lao (1132/1133/1341)
IBM EBCDIC US-Canada (037 + Euro symbol) (1140)
IBM EBCDIC Germany (20273 + Euro symbol) (1141)
IBM EBCDIC Denmark-Norway (20277 + Euro symbol) (1142)
IBM EBCDIC Finland-Sweden (20278 + Euro symbol) (1143)
IBM EBCDIC Italy (20280 + Euro symbol) (1144)
IBM EBCDIC Latin America-Spain (20284 + Euro symbol) (1145)
IBM EBCDIC United Kingdom (20285 + Euro symbol) (1146)
IBM EBCDIC France (20297 + Euro symbol) (1147)
IBM EBCDIC International (500 + Euro symbol) (1148)
IBM EBCDIC Icelandic (20871 + Euro symbol) (1149)
IBM EBCDIC Germany (20273)
IBM EBCDIC Denmark-Norway (20277)
IBM EBCDIC Finland-Sweden (20278)
IBM EBCDIC Italy (20280)
IBM EBCDIC Latin America-Spain (20284)
IBM EBCDIC United Kingdom (20285)
IBM EBCDIC Japanese Katakana Extended (20290)
IBM EBCDIC France (20297)
IBM EBCDIC Arabic (20420)
IBM EBCDIC Greek (20423)
IBM EBCDIC Hebrew (20424)
IBM EBCDIC Korean Extended (20833)
IBM EBCDIC Thai (20838)
IBM EBCDIC Icelandic (20871)
IBM EBCDIC Cyrillic Russian (20880)
IBM EBCDIC Turkish (20905)
IBM EBCDIC Latin 1/Open System (1047 + Euro symbol) (20924)
IBM EBCDIC Cyrillic Serbian-Bulgarian (21025)
OEM United States (437)
OEM Greek (formerly 437G); Greek (DOS) (737)
OEM Baltic; Baltic (DOS) (775)
OEM Russian; Cyrillic + Euro symbol (808)
OEM Multilingual Latin 1; Western European (DOS) (850)
OEM Latin 2; Central European (DOS) (852)
OEM Cyrillic (primarily Russian) (855)
OEM Turkish; Turkish (DOS) (857)
OEM Multilingual Latin 1 + Euro symbol (858)
OEM Portuguese; Portuguese (DOS) (860)
OEM Icelandic; Icelandic (DOS) (861)
OEM Hebrew; Hebrew (DOS) (862)
OEM French Canadian; French Canadian (DOS) (863)
OEM Arabic; Arabic (864) (864)
OEM Nordic; Nordic (DOS) (865)
OEM Russian; Cyrillic (DOS) (866)
OEM Modern Greek; Greek, Modern (DOS) (869)
OEM Cyrillic (primarily Russian) + Euro Symbol (872)
Windows-874 Thai (874)
Windows-1250 Central European (1250)
Windows-1251 Cyrillic (1251)
Windows-1252 Latin (1252)
Windows-1253 Greek (1253)
Windows-1254 Turkish (1254)
Windows-1255 Hebrew (1255)
Windows-1256 Arabic (1256)
Windows-1257 Baltic (1257)
Windows-1258 Vietnam (1258)
ISO-8859-1 Latin 1 Western European (28591)
ISO-8859-2 Latin 2 Central European (28592)
ISO-8859-3 Latin 3 South European (28593)
ISO-8859-4 Latin 4 North European (28594)
ISO-8859-5 Latin/Cyrillic (28595)
ISO-8859-6 Latin/Arabic (28596)
ISO-8859-7 Latin/Greek (28597)
ISO-8859-8 Latin/Hebrew (28598)
ISO 8859-8 Hebrew (ISO-Logical) (38598)
ISO-8859-9 Latin 5 Turkish (28599)
ISO-8859-10 Latin 6 Nordic (28600)
ISO-8859-11 Latin/Thai (28601)
ISO-8859-13 Latin 7 Baltic Rim (28603)
ISO-8859-14 Latin 8 Celtic (28604)
ISO-8859-15 Latin 9 (28605)
ISO-8859-16 Latin 10 (28606)
ISO 2022 JIS Japanese with no halfwidth Katakana (50220)
ISO 2022 JIS Japanese with halfwidth Katakana (50221)
ISO 2022 Japanese JIS X 0201-1989 (1 byte Kana-SO/SI) (50222)
ISO 2022 Korean (50225)
ISO 2022 Simplified Chinese (50227)
ISO 6937 Non-Spacing Accent (20269)
EUC Japanese (51932)
EUC Simplified Chinese (51936)
EUC Korean (51949)
ISCII Devanagari (57002)
ISCII Bengali (57003)
ISCII Tamil (57004)
ISCII Telugu (57005)
ISCII Assamese (57006)
ISCII Oriya (57007)
ISCII Kannada (57008)
ISCII Malayalam (57009)
ISCII Gujarati (57010)
ISCII Punjabi (57011)
Japanese Shift-JIS (932)
Simplified Chinese GBK (936)
Korean (949)
Traditional Chinese Big5 (950)
US-ASCII (7-bit) (20127)
Simplified Chinese GB2312 (20936)
KOI8-R Russian Cyrillic (20866)
KOI8-U Ukrainian Cyrillic (21866)
Mazovia (Polish) MS-DOS (620)
Arabic (ASMO 708) (708)
Arabic (Transparent ASMO); Arabic (DOS) (720)
Kamenický (Czech) MS-DOS (895)
Korean (Johab) (1361)
MAC Roman (10000)
Japanese (Mac) (10001)
MAC Traditional Chinese (Big5) (10002)
Korean (Mac) (10003)
Arabic (Mac) (10004)
Hebrew (Mac) (10005)
Greek (Mac) (10006)
Cyrillic (Mac) (10007)
MAC Simplified Chinese (GB 2312) (10008)
Romanian (Mac) (10010)
Ukrainian (Mac) (10017)
Thai (Mac) (10021)
MAC Latin 2 (Central European) (10029)
Icelandic (Mac) (10079)
Turkish (Mac) (10081)
Croatian (Mac) (10082)
CNS Taiwan (Chinese Traditional) (20000)
TCA Taiwan (20001)
ETEN Taiwan (Chinese Traditional) (20002)
IBM5550 Taiwan (20003)
TeleText Taiwan (20004)
Wang Taiwan (20005)
Western European IA5 (IRV International Alphabet 5) (20105)
IA5 German (7-bit) (20106)
IA5 Swedish (7-bit) (20107)
IA5 Norwegian (7-bit) (20108)
T.61 (20261)
Japanese (JIS 0208-1990 and 0212-1990) (20932)
Korean Wansung (20949)
Extended/Ext Alpha Lowercase (21027)
Europa 3 (29001)
Atari ST/TT (47451)
HZ-GB2312 Simplified Chinese (52936)
Simplified Chinese GB18030 (54936)


**Arguments:**
*   `encoding` (Enum: [UTF-8 (65001), UTF-7 (65000), UTF-16LE (1200), UTF-16BE (1201), UTF-32LE (12000), ...]): Default: UTF-8 (65001),UTF-7 (65000),UTF-16LE (1200),UTF-16BE (1201),UTF-32LE (12000),UTF-32BE (12001),IBM EBCDIC International (500),IBM EBCDIC US-Canada (37),IBM EBCDIC Multilingual/ROECE (Latin 2) (870),IBM EBCDIC Greek Modern (875),IBM EBCDIC French (1010),IBM EBCDIC Turkish (Latin 5) (1026),IBM EBCDIC Latin 1/Open System (1047),IBM EBCDIC Lao (1132/1133/1341),IBM EBCDIC US-Canada (037 + Euro symbol) (1140),IBM EBCDIC Germany (20273 + Euro symbol) (1141),IBM EBCDIC Denmark-Norway (20277 + Euro symbol) (1142),IBM EBCDIC Finland-Sweden (20278 + Euro symbol) (1143),IBM EBCDIC Italy (20280 + Euro symbol) (1144),IBM EBCDIC Latin America-Spain (20284 + Euro symbol) (1145),IBM EBCDIC United Kingdom (20285 + Euro symbol) (1146),IBM EBCDIC France (20297 + Euro symbol) (1147),IBM EBCDIC International (500 + Euro symbol) (1148),IBM EBCDIC Icelandic (20871 + Euro symbol) (1149),IBM EBCDIC Germany (20273),IBM EBCDIC Denmark-Norway (20277),IBM EBCDIC Finland-Sweden (20278),IBM EBCDIC Italy (20280),IBM EBCDIC Latin America-Spain (20284),IBM EBCDIC United Kingdom (20285),IBM EBCDIC Japanese Katakana Extended (20290),IBM EBCDIC France (20297),IBM EBCDIC Arabic (20420),IBM EBCDIC Greek (20423),IBM EBCDIC Hebrew (20424),IBM EBCDIC Korean Extended (20833),IBM EBCDIC Thai (20838),IBM EBCDIC Icelandic (20871),IBM EBCDIC Cyrillic Russian (20880),IBM EBCDIC Turkish (20905),IBM EBCDIC Latin 1/Open System (1047 + Euro symbol) (20924),IBM EBCDIC Cyrillic Serbian-Bulgarian (21025),OEM United States (437),OEM Greek (formerly 437G); Greek (DOS) (737),OEM Baltic; Baltic (DOS) (775),OEM Russian; Cyrillic + Euro symbol (808),OEM Multilingual Latin 1; Western European (DOS) (850),OEM Latin 2; Central European (DOS) (852),OEM Cyrillic (primarily Russian) (855),OEM Turkish; Turkish (DOS) (857),OEM Multilingual Latin 1 + Euro symbol (858),OEM Portuguese; Portuguese (DOS) (860),OEM Icelandic; Icelandic (DOS) (861),OEM Hebrew; Hebrew (DOS) (862),OEM French Canadian; French Canadian (DOS) (863),OEM Arabic; Arabic (864) (864),OEM Nordic; Nordic (DOS) (865),OEM Russian; Cyrillic (DOS) (866),OEM Modern Greek; Greek, Modern (DOS) (869),OEM Cyrillic (primarily Russian) + Euro Symbol (872),Windows-874 Thai (874),Windows-1250 Central European (1250),Windows-1251 Cyrillic (1251),Windows-1252 Latin (1252),Windows-1253 Greek (1253),Windows-1254 Turkish (1254),Windows-1255 Hebrew (1255),Windows-1256 Arabic (1256),Windows-1257 Baltic (1257),Windows-1258 Vietnam (1258),ISO-8859-1 Latin 1 Western European (28591),ISO-8859-2 Latin 2 Central European (28592),ISO-8859-3 Latin 3 South European (28593),ISO-8859-4 Latin 4 North European (28594),ISO-8859-5 Latin/Cyrillic (28595),ISO-8859-6 Latin/Arabic (28596),ISO-8859-7 Latin/Greek (28597),ISO-8859-8 Latin/Hebrew (28598),ISO 8859-8 Hebrew (ISO-Logical) (38598),ISO-8859-9 Latin 5 Turkish (28599),ISO-8859-10 Latin 6 Nordic (28600),ISO-8859-11 Latin/Thai (28601),ISO-8859-13 Latin 7 Baltic Rim (28603),ISO-8859-14 Latin 8 Celtic (28604),ISO-8859-15 Latin 9 (28605),ISO-8859-16 Latin 10 (28606),ISO 2022 JIS Japanese with no halfwidth Katakana (50220),ISO 2022 JIS Japanese with halfwidth Katakana (50221),ISO 2022 Japanese JIS X 0201-1989 (1 byte Kana-SO/SI) (50222),ISO 2022 Korean (50225),ISO 2022 Simplified Chinese (50227),ISO 6937 Non-Spacing Accent (20269),EUC Japanese (51932),EUC Simplified Chinese (51936),EUC Korean (51949),ISCII Devanagari (57002),ISCII Bengali (57003),ISCII Tamil (57004),ISCII Telugu (57005),ISCII Assamese (57006),ISCII Oriya (57007),ISCII Kannada (57008),ISCII Malayalam (57009),ISCII Gujarati (57010),ISCII Punjabi (57011),Japanese Shift-JIS (932),Simplified Chinese GBK (936),Korean (949),Traditional Chinese Big5 (950),US-ASCII (7-bit) (20127),Simplified Chinese GB2312 (20936),KOI8-R Russian Cyrillic (20866),KOI8-U Ukrainian Cyrillic (21866),Mazovia (Polish) MS-DOS (620),Arabic (ASMO 708) (708),Arabic (Transparent ASMO); Arabic (DOS) (720),Kamenický (Czech) MS-DOS (895),Korean (Johab) (1361),MAC Roman (10000),Japanese (Mac) (10001),MAC Traditional Chinese (Big5) (10002),Korean (Mac) (10003),Arabic (Mac) (10004),Hebrew (Mac) (10005),Greek (Mac) (10006),Cyrillic (Mac) (10007),MAC Simplified Chinese (GB 2312) (10008),Romanian (Mac) (10010),Ukrainian (Mac) (10017),Thai (Mac) (10021),MAC Latin 2 (Central European) (10029),Icelandic (Mac) (10079),Turkish (Mac) (10081),Croatian (Mac) (10082),CNS Taiwan (Chinese Traditional) (20000),TCA Taiwan (20001),ETEN Taiwan (Chinese Traditional) (20002),IBM5550 Taiwan (20003),TeleText Taiwan (20004),Wang Taiwan (20005),Western European IA5 (IRV International Alphabet 5) (20105),IA5 German (7-bit) (20106),IA5 Swedish (7-bit) (20107),IA5 Norwegian (7-bit) (20108),T.61 (20261),Japanese (JIS 0208-1990 and 0212-1990) (20932),Korean Wansung (20949),Extended/Ext Alpha Lowercase (21027),Europa 3 (29001),Atari ST/TT (47451),HZ-GB2312 Simplified Chinese (52936),Simplified Chinese GB18030 (54936)

**Example:**
```json
{ "name": "cyberchef_encode_text", "arguments": { "input": "..." } }
```

---

#### Decode text (`cyberchef_decode_text`)
Decodes text from the chosen character encoding.



Supported charsets are:

UTF-8 (65001)
UTF-7 (65000)
UTF-16LE (1200)
UTF-16BE (1201)
UTF-32LE (12000)
UTF-32BE (12001)
IBM EBCDIC International (500)
IBM EBCDIC US-Canada (37)
IBM EBCDIC Multilingual/ROECE (Latin 2) (870)
IBM EBCDIC Greek Modern (875)
IBM EBCDIC French (1010)
IBM EBCDIC Turkish (Latin 5) (1026)
IBM EBCDIC Latin 1/Open System (1047)
IBM EBCDIC Lao (1132/1133/1341)
IBM EBCDIC US-Canada (037 + Euro symbol) (1140)
IBM EBCDIC Germany (20273 + Euro symbol) (1141)
IBM EBCDIC Denmark-Norway (20277 + Euro symbol) (1142)
IBM EBCDIC Finland-Sweden (20278 + Euro symbol) (1143)
IBM EBCDIC Italy (20280 + Euro symbol) (1144)
IBM EBCDIC Latin America-Spain (20284 + Euro symbol) (1145)
IBM EBCDIC United Kingdom (20285 + Euro symbol) (1146)
IBM EBCDIC France (20297 + Euro symbol) (1147)
IBM EBCDIC International (500 + Euro symbol) (1148)
IBM EBCDIC Icelandic (20871 + Euro symbol) (1149)
IBM EBCDIC Germany (20273)
IBM EBCDIC Denmark-Norway (20277)
IBM EBCDIC Finland-Sweden (20278)
IBM EBCDIC Italy (20280)
IBM EBCDIC Latin America-Spain (20284)
IBM EBCDIC United Kingdom (20285)
IBM EBCDIC Japanese Katakana Extended (20290)
IBM EBCDIC France (20297)
IBM EBCDIC Arabic (20420)
IBM EBCDIC Greek (20423)
IBM EBCDIC Hebrew (20424)
IBM EBCDIC Korean Extended (20833)
IBM EBCDIC Thai (20838)
IBM EBCDIC Icelandic (20871)
IBM EBCDIC Cyrillic Russian (20880)
IBM EBCDIC Turkish (20905)
IBM EBCDIC Latin 1/Open System (1047 + Euro symbol) (20924)
IBM EBCDIC Cyrillic Serbian-Bulgarian (21025)
OEM United States (437)
OEM Greek (formerly 437G); Greek (DOS) (737)
OEM Baltic; Baltic (DOS) (775)
OEM Russian; Cyrillic + Euro symbol (808)
OEM Multilingual Latin 1; Western European (DOS) (850)
OEM Latin 2; Central European (DOS) (852)
OEM Cyrillic (primarily Russian) (855)
OEM Turkish; Turkish (DOS) (857)
OEM Multilingual Latin 1 + Euro symbol (858)
OEM Portuguese; Portuguese (DOS) (860)
OEM Icelandic; Icelandic (DOS) (861)
OEM Hebrew; Hebrew (DOS) (862)
OEM French Canadian; French Canadian (DOS) (863)
OEM Arabic; Arabic (864) (864)
OEM Nordic; Nordic (DOS) (865)
OEM Russian; Cyrillic (DOS) (866)
OEM Modern Greek; Greek, Modern (DOS) (869)
OEM Cyrillic (primarily Russian) + Euro Symbol (872)
Windows-874 Thai (874)
Windows-1250 Central European (1250)
Windows-1251 Cyrillic (1251)
Windows-1252 Latin (1252)
Windows-1253 Greek (1253)
Windows-1254 Turkish (1254)
Windows-1255 Hebrew (1255)
Windows-1256 Arabic (1256)
Windows-1257 Baltic (1257)
Windows-1258 Vietnam (1258)
ISO-8859-1 Latin 1 Western European (28591)
ISO-8859-2 Latin 2 Central European (28592)
ISO-8859-3 Latin 3 South European (28593)
ISO-8859-4 Latin 4 North European (28594)
ISO-8859-5 Latin/Cyrillic (28595)
ISO-8859-6 Latin/Arabic (28596)
ISO-8859-7 Latin/Greek (28597)
ISO-8859-8 Latin/Hebrew (28598)
ISO 8859-8 Hebrew (ISO-Logical) (38598)
ISO-8859-9 Latin 5 Turkish (28599)
ISO-8859-10 Latin 6 Nordic (28600)
ISO-8859-11 Latin/Thai (28601)
ISO-8859-13 Latin 7 Baltic Rim (28603)
ISO-8859-14 Latin 8 Celtic (28604)
ISO-8859-15 Latin 9 (28605)
ISO-8859-16 Latin 10 (28606)
ISO 2022 JIS Japanese with no halfwidth Katakana (50220)
ISO 2022 JIS Japanese with halfwidth Katakana (50221)
ISO 2022 Japanese JIS X 0201-1989 (1 byte Kana-SO/SI) (50222)
ISO 2022 Korean (50225)
ISO 2022 Simplified Chinese (50227)
ISO 6937 Non-Spacing Accent (20269)
EUC Japanese (51932)
EUC Simplified Chinese (51936)
EUC Korean (51949)
ISCII Devanagari (57002)
ISCII Bengali (57003)
ISCII Tamil (57004)
ISCII Telugu (57005)
ISCII Assamese (57006)
ISCII Oriya (57007)
ISCII Kannada (57008)
ISCII Malayalam (57009)
ISCII Gujarati (57010)
ISCII Punjabi (57011)
Japanese Shift-JIS (932)
Simplified Chinese GBK (936)
Korean (949)
Traditional Chinese Big5 (950)
US-ASCII (7-bit) (20127)
Simplified Chinese GB2312 (20936)
KOI8-R Russian Cyrillic (20866)
KOI8-U Ukrainian Cyrillic (21866)
Mazovia (Polish) MS-DOS (620)
Arabic (ASMO 708) (708)
Arabic (Transparent ASMO); Arabic (DOS) (720)
Kamenický (Czech) MS-DOS (895)
Korean (Johab) (1361)
MAC Roman (10000)
Japanese (Mac) (10001)
MAC Traditional Chinese (Big5) (10002)
Korean (Mac) (10003)
Arabic (Mac) (10004)
Hebrew (Mac) (10005)
Greek (Mac) (10006)
Cyrillic (Mac) (10007)
MAC Simplified Chinese (GB 2312) (10008)
Romanian (Mac) (10010)
Ukrainian (Mac) (10017)
Thai (Mac) (10021)
MAC Latin 2 (Central European) (10029)
Icelandic (Mac) (10079)
Turkish (Mac) (10081)
Croatian (Mac) (10082)
CNS Taiwan (Chinese Traditional) (20000)
TCA Taiwan (20001)
ETEN Taiwan (Chinese Traditional) (20002)
IBM5550 Taiwan (20003)
TeleText Taiwan (20004)
Wang Taiwan (20005)
Western European IA5 (IRV International Alphabet 5) (20105)
IA5 German (7-bit) (20106)
IA5 Swedish (7-bit) (20107)
IA5 Norwegian (7-bit) (20108)
T.61 (20261)
Japanese (JIS 0208-1990 and 0212-1990) (20932)
Korean Wansung (20949)
Extended/Ext Alpha Lowercase (21027)
Europa 3 (29001)
Atari ST/TT (47451)
HZ-GB2312 Simplified Chinese (52936)
Simplified Chinese GB18030 (54936)


**Arguments:**
*   `encoding` (Enum: [UTF-8 (65001), UTF-7 (65000), UTF-16LE (1200), UTF-16BE (1201), UTF-32LE (12000), ...]): Default: UTF-8 (65001),UTF-7 (65000),UTF-16LE (1200),UTF-16BE (1201),UTF-32LE (12000),UTF-32BE (12001),IBM EBCDIC International (500),IBM EBCDIC US-Canada (37),IBM EBCDIC Multilingual/ROECE (Latin 2) (870),IBM EBCDIC Greek Modern (875),IBM EBCDIC French (1010),IBM EBCDIC Turkish (Latin 5) (1026),IBM EBCDIC Latin 1/Open System (1047),IBM EBCDIC Lao (1132/1133/1341),IBM EBCDIC US-Canada (037 + Euro symbol) (1140),IBM EBCDIC Germany (20273 + Euro symbol) (1141),IBM EBCDIC Denmark-Norway (20277 + Euro symbol) (1142),IBM EBCDIC Finland-Sweden (20278 + Euro symbol) (1143),IBM EBCDIC Italy (20280 + Euro symbol) (1144),IBM EBCDIC Latin America-Spain (20284 + Euro symbol) (1145),IBM EBCDIC United Kingdom (20285 + Euro symbol) (1146),IBM EBCDIC France (20297 + Euro symbol) (1147),IBM EBCDIC International (500 + Euro symbol) (1148),IBM EBCDIC Icelandic (20871 + Euro symbol) (1149),IBM EBCDIC Germany (20273),IBM EBCDIC Denmark-Norway (20277),IBM EBCDIC Finland-Sweden (20278),IBM EBCDIC Italy (20280),IBM EBCDIC Latin America-Spain (20284),IBM EBCDIC United Kingdom (20285),IBM EBCDIC Japanese Katakana Extended (20290),IBM EBCDIC France (20297),IBM EBCDIC Arabic (20420),IBM EBCDIC Greek (20423),IBM EBCDIC Hebrew (20424),IBM EBCDIC Korean Extended (20833),IBM EBCDIC Thai (20838),IBM EBCDIC Icelandic (20871),IBM EBCDIC Cyrillic Russian (20880),IBM EBCDIC Turkish (20905),IBM EBCDIC Latin 1/Open System (1047 + Euro symbol) (20924),IBM EBCDIC Cyrillic Serbian-Bulgarian (21025),OEM United States (437),OEM Greek (formerly 437G); Greek (DOS) (737),OEM Baltic; Baltic (DOS) (775),OEM Russian; Cyrillic + Euro symbol (808),OEM Multilingual Latin 1; Western European (DOS) (850),OEM Latin 2; Central European (DOS) (852),OEM Cyrillic (primarily Russian) (855),OEM Turkish; Turkish (DOS) (857),OEM Multilingual Latin 1 + Euro symbol (858),OEM Portuguese; Portuguese (DOS) (860),OEM Icelandic; Icelandic (DOS) (861),OEM Hebrew; Hebrew (DOS) (862),OEM French Canadian; French Canadian (DOS) (863),OEM Arabic; Arabic (864) (864),OEM Nordic; Nordic (DOS) (865),OEM Russian; Cyrillic (DOS) (866),OEM Modern Greek; Greek, Modern (DOS) (869),OEM Cyrillic (primarily Russian) + Euro Symbol (872),Windows-874 Thai (874),Windows-1250 Central European (1250),Windows-1251 Cyrillic (1251),Windows-1252 Latin (1252),Windows-1253 Greek (1253),Windows-1254 Turkish (1254),Windows-1255 Hebrew (1255),Windows-1256 Arabic (1256),Windows-1257 Baltic (1257),Windows-1258 Vietnam (1258),ISO-8859-1 Latin 1 Western European (28591),ISO-8859-2 Latin 2 Central European (28592),ISO-8859-3 Latin 3 South European (28593),ISO-8859-4 Latin 4 North European (28594),ISO-8859-5 Latin/Cyrillic (28595),ISO-8859-6 Latin/Arabic (28596),ISO-8859-7 Latin/Greek (28597),ISO-8859-8 Latin/Hebrew (28598),ISO 8859-8 Hebrew (ISO-Logical) (38598),ISO-8859-9 Latin 5 Turkish (28599),ISO-8859-10 Latin 6 Nordic (28600),ISO-8859-11 Latin/Thai (28601),ISO-8859-13 Latin 7 Baltic Rim (28603),ISO-8859-14 Latin 8 Celtic (28604),ISO-8859-15 Latin 9 (28605),ISO-8859-16 Latin 10 (28606),ISO 2022 JIS Japanese with no halfwidth Katakana (50220),ISO 2022 JIS Japanese with halfwidth Katakana (50221),ISO 2022 Japanese JIS X 0201-1989 (1 byte Kana-SO/SI) (50222),ISO 2022 Korean (50225),ISO 2022 Simplified Chinese (50227),ISO 6937 Non-Spacing Accent (20269),EUC Japanese (51932),EUC Simplified Chinese (51936),EUC Korean (51949),ISCII Devanagari (57002),ISCII Bengali (57003),ISCII Tamil (57004),ISCII Telugu (57005),ISCII Assamese (57006),ISCII Oriya (57007),ISCII Kannada (57008),ISCII Malayalam (57009),ISCII Gujarati (57010),ISCII Punjabi (57011),Japanese Shift-JIS (932),Simplified Chinese GBK (936),Korean (949),Traditional Chinese Big5 (950),US-ASCII (7-bit) (20127),Simplified Chinese GB2312 (20936),KOI8-R Russian Cyrillic (20866),KOI8-U Ukrainian Cyrillic (21866),Mazovia (Polish) MS-DOS (620),Arabic (ASMO 708) (708),Arabic (Transparent ASMO); Arabic (DOS) (720),Kamenický (Czech) MS-DOS (895),Korean (Johab) (1361),MAC Roman (10000),Japanese (Mac) (10001),MAC Traditional Chinese (Big5) (10002),Korean (Mac) (10003),Arabic (Mac) (10004),Hebrew (Mac) (10005),Greek (Mac) (10006),Cyrillic (Mac) (10007),MAC Simplified Chinese (GB 2312) (10008),Romanian (Mac) (10010),Ukrainian (Mac) (10017),Thai (Mac) (10021),MAC Latin 2 (Central European) (10029),Icelandic (Mac) (10079),Turkish (Mac) (10081),Croatian (Mac) (10082),CNS Taiwan (Chinese Traditional) (20000),TCA Taiwan (20001),ETEN Taiwan (Chinese Traditional) (20002),IBM5550 Taiwan (20003),TeleText Taiwan (20004),Wang Taiwan (20005),Western European IA5 (IRV International Alphabet 5) (20105),IA5 German (7-bit) (20106),IA5 Swedish (7-bit) (20107),IA5 Norwegian (7-bit) (20108),T.61 (20261),Japanese (JIS 0208-1990 and 0212-1990) (20932),Korean Wansung (20949),Extended/Ext Alpha Lowercase (21027),Europa 3 (29001),Atari ST/TT (47451),HZ-GB2312 Simplified Chinese (52936),Simplified Chinese GB18030 (54936)

**Example:**
```json
{ "name": "cyberchef_decode_text", "arguments": { "input": "..." } }
```

---

#### Unicode Text Format (`cyberchef_unicode_text_format`)
Adds Unicode combining characters to change formatting of plaintext.

**Arguments:**
*   `underline` (boolean): Default: false
*   `strikethrough` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_unicode_text_format", "arguments": { "input": "..." } }
```

---

#### Remove Diacritics (`cyberchef_remove_diacritics`)
Replaces accented characters with their latin character equivalent. Accented characters are made up of Unicode combining characters, so unicode text formatting such as strikethroughs and underlines will also be removed.

**Example:**
```json
{ "name": "cyberchef_remove_diacritics", "arguments": { "input": "..." } }
```

---

#### Unescape Unicode Characters (`cyberchef_unescape_unicode_characters`)
Converts unicode-escaped character notation back into raw characters.

Supports the prefixes:\u%uU+e.g. \u03c3\u03bf\u03c5 becomes σου

**Arguments:**
*   `prefix` (Enum: [\u, %u, U+]): Default: \u,%u,U+

**Example:**
```json
{ "name": "cyberchef_unescape_unicode_characters", "arguments": { "input": "..." } }
```

---

#### Convert to NATO alphabet (`cyberchef_convert_to_nato_alphabet`)
Converts characters to their representation in the NATO phonetic alphabet.

**Example:**
```json
{ "name": "cyberchef_convert_to_nato_alphabet", "arguments": { "input": "..." } }
```

---

#### Convert Leet Speak (`cyberchef_convert_leet_speak`)
Converts to and from Leet Speak.

**Arguments:**
*   `direction` (Enum: [To Leet Speak, From Leet Speak]): Default: To Leet Speak,From Leet Speak

**Example:**
```json
{ "name": "cyberchef_convert_leet_speak", "arguments": { "input": "..." } }
```

---

### Utils

#### Diff (`cyberchef_diff`)
Compares two inputs (separated by the specified delimiter) and highlights the differences between them.

**Arguments:**
*   `sample_delimiter` (binaryString): Default: \n\n
*   `diff_by` (Enum: [Character, Word, Line, Sentence, CSS, ...]): Default: Character,Word,Line,Sentence,CSS,JSON
*   `show_added` (boolean): Default: true
*   `show_removed` (boolean): Default: true
*   `show_subtraction` (boolean): Default: false
*   `ignore_whitespace` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_diff", "arguments": { "input": "..." } }
```

---

#### Remove whitespace (`cyberchef_remove_whitespace`)
Optionally removes all spaces, carriage returns, line feeds, tabs and form feeds from the input data.

This operation also supports the removal of full stops which are sometimes used to represent non-printable bytes in ASCII output.

**Arguments:**
*   `spaces` (boolean): Default: true
*   `carriage_returns_(\r)` (boolean): Default: true
*   `line_feeds_(\n)` (boolean): Default: true
*   `tabs` (boolean): Default: true
*   `form_feeds_(\f)` (boolean): Default: true
*   `full_stops` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_remove_whitespace", "arguments": { "input": "..." } }
```

---

#### Remove null bytes (`cyberchef_remove_null_bytes`)
Removes all null bytes (0x00) from the input.

**Example:**
```json
{ "name": "cyberchef_remove_null_bytes", "arguments": { "input": "..." } }
```

---

#### To Upper case (`cyberchef_to_upper_case`)
Converts the input string to upper case, optionally limiting scope to only the first character in each word, sentence or paragraph.

**Arguments:**
*   `scope` (Enum: [All, Word, Sentence, Paragraph]): Default: All,Word,Sentence,Paragraph

**Example:**
```json
{ "name": "cyberchef_to_upper_case", "arguments": { "input": "..." } }
```

---

#### To Lower case (`cyberchef_to_lower_case`)
Converts every character in the input to lower case.

**Example:**
```json
{ "name": "cyberchef_to_lower_case", "arguments": { "input": "..." } }
```

---

#### Swap case (`cyberchef_swap_case`)
Converts uppercase letters to lowercase ones, and lowercase ones to uppercase ones.

**Example:**
```json
{ "name": "cyberchef_swap_case", "arguments": { "input": "..." } }
```

---

#### Alternating Caps (`cyberchef_alternating_caps`)
Alternating caps, also known as studly caps, sticky caps, or spongecase is a form of text notation in which the capitalization of letters varies by some pattern, or arbitrarily. An example of this would be spelling 'alternative caps' as 'aLtErNaTiNg CaPs'.

**Example:**
```json
{ "name": "cyberchef_alternating_caps", "arguments": { "input": "..." } }
```

---

#### To Case Insensitive Regex (`cyberchef_to_case_insensitive_regex`)
Converts a case-sensitive regex string into a case-insensitive regex string in case the i flag is unavailable to you.

e.g. Mozilla/[0-9].[0-9] .* becomes [mM][oO][zZ][iI][lL][lL][aA]/[0-9].[0-9] .*

**Example:**
```json
{ "name": "cyberchef_to_case_insensitive_regex", "arguments": { "input": "..." } }
```

---

#### From Case Insensitive Regex (`cyberchef_from_case_insensitive_regex`)
Converts a case-insensitive regex string to a case sensitive regex string (no guarantee on it being the proper original casing) in case the i flag wasn't available at the time but now is, or you need it to be case-sensitive again.

e.g. [mM][oO][zZ][iI][lL][lL][aA]/[0-9].[0-9] .* becomes Mozilla/[0-9].[0-9] .*

**Example:**
```json
{ "name": "cyberchef_from_case_insensitive_regex", "arguments": { "input": "..." } }
```

---

#### Add line numbers (`cyberchef_add_line_numbers`)
Adds line numbers to the output.

**Arguments:**
*   `offset` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_add_line_numbers", "arguments": { "input": "..." } }
```

---

#### Remove line numbers (`cyberchef_remove_line_numbers`)
Removes line numbers from the output if they can be trivially detected.

**Example:**
```json
{ "name": "cyberchef_remove_line_numbers", "arguments": { "input": "..." } }
```

---

#### Get All Casings (`cyberchef_get_all_casings`)
Outputs all possible casing variations of a string.

**Example:**
```json
{ "name": "cyberchef_get_all_casings", "arguments": { "input": "..." } }
```

---

#### To Table (`cyberchef_to_table`)
Data can be split on different characters and rendered as an HTML, ASCII or Markdown table with an optional header row.

Supports the CSV (Comma Separated Values) file format by default. Change the cell delimiter argument to \t to support TSV (Tab Separated Values) or | for PSV (Pipe Separated Values).

You can enter as many delimiters as you like. Each character will be treat as a separate possible delimiter.

**Arguments:**
*   `cell_delimiters` (binaryShortString): Default: ,
*   `row_delimiters` (binaryShortString): Default: \r\n
*   `make_first_row_header` (boolean): Default: false
*   `format` (Enum: [ASCII, HTML, Markdown]): Default: ASCII,HTML,Markdown

**Example:**
```json
{ "name": "cyberchef_to_table", "arguments": { "input": "..." } }
```

---

#### Reverse (`cyberchef_reverse`)
Reverses the input string.

**Arguments:**
*   `by` (Enum: [Byte, Character, Line]): Default: Byte,Character,Line

**Example:**
```json
{ "name": "cyberchef_reverse", "arguments": { "input": "..." } }
```

---

#### Sort (`cyberchef_sort`)
Alphabetically sorts strings separated by the specified delimiter.

The IP address option supports IPv4 only.

**Arguments:**
*   `delimiter` (Enum: [Line feed, CRLF, Space, Comma, Semi-colon, ...]): Default: Line feed,CRLF,Space,Comma,Semi-colon,Colon,Nothing (separate chars)
*   `reverse` (boolean): Default: false
*   `order` (Enum: [Alphabetical (case sensitive), Alphabetical (case insensitive), IP address, Numeric, Numeric (hexadecimal), ...]): Default: Alphabetical (case sensitive),Alphabetical (case insensitive),IP address,Numeric,Numeric (hexadecimal),Length

**Example:**
```json
{ "name": "cyberchef_sort", "arguments": { "input": "..." } }
```

---

#### Shuffle (`cyberchef_shuffle`)
Randomly reorders input elements.

**Arguments:**
*   `delimiter` (Enum: [Line feed, CRLF, Space, Comma, Semi-colon, ...]): Default: Line feed,CRLF,Space,Comma,Semi-colon,Colon,Nothing (separate chars)

**Example:**
```json
{ "name": "cyberchef_shuffle", "arguments": { "input": "..." } }
```

---

#### Unique (`cyberchef_unique`)
Removes duplicate strings from the input.

**Arguments:**
*   `delimiter` (Enum: [Line feed, CRLF, Space, Comma, Semi-colon, ...]): Default: Line feed,CRLF,Space,Comma,Semi-colon,Colon,Nothing (separate chars)
*   `display_count` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_unique", "arguments": { "input": "..." } }
```

---

#### Split (`cyberchef_split`)
Splits a string into sections around a given delimiter.

**Arguments:**
*   `split_delimiter` (editableOptionShort): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `join_delimiter` (editableOptionShort): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]

**Example:**
```json
{ "name": "cyberchef_split", "arguments": { "input": "..." } }
```

---

#### Filter (`cyberchef_filter`)
Splits up the input using the specified delimiter and then filters each branch based on a regular expression.

**Arguments:**
*   `delimiter` (Enum: [Line feed, CRLF, Space, Comma, Semi-colon, ...]): Default: Line feed,CRLF,Space,Comma,Semi-colon,Colon,Nothing (separate chars)
*   `regex` (string): Default: ""
*   `invert_condition` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_filter", "arguments": { "input": "..." } }
```

---

#### Head (`cyberchef_head`)
Like the UNIX head utility.
Gets the first n lines.
You can select all but the last n lines by entering a negative value for n.
The delimiter can be changed so that instead of lines, fields (i.e. commas) are selected instead.

**Arguments:**
*   `delimiter` (Enum: [Line feed, CRLF, Space, Comma, Semi-colon, ...]): Default: Line feed,CRLF,Space,Comma,Semi-colon,Colon,Nothing (separate chars)
*   `number` (number): Default: 10

**Example:**
```json
{ "name": "cyberchef_head", "arguments": { "input": "..." } }
```

---

#### Tail (`cyberchef_tail`)
Like the UNIX tail utility.
Gets the last n lines.
Optionally you can select all lines after line n by entering a negative value for n.
The delimiter can be changed so that instead of lines, fields (i.e. commas) are selected instead.

**Arguments:**
*   `delimiter` (Enum: [Line feed, CRLF, Space, Comma, Semi-colon, ...]): Default: Line feed,CRLF,Space,Comma,Semi-colon,Colon,Nothing (separate chars)
*   `number` (number): Default: 10

**Example:**
```json
{ "name": "cyberchef_tail", "arguments": { "input": "..." } }
```

---

#### Count occurrences (`cyberchef_count_occurrences`)
Counts the number of times the provided string occurs in the input.

**Arguments:**
*   `search_string` (toggleString): Default: ""

**Example:**
```json
{ "name": "cyberchef_count_occurrences", "arguments": { "input": "..." } }
```

---

#### Expand alphabet range (`cyberchef_expand_alphabet_range`)
Expand an alphabet range string into a list of the characters in that range.

e.g. a-z becomes abcdefghijklmnopqrstuvwxyz.

**Arguments:**
*   `delimiter` (binaryString): Default: ""

**Example:**
```json
{ "name": "cyberchef_expand_alphabet_range", "arguments": { "input": "..." } }
```

---

#### Drop bytes (`cyberchef_drop_bytes`)
Cuts a slice of the specified number of bytes out of the data. Negative values are allowed.

**Arguments:**
*   `start` (number): Default: 0
*   `length` (number): Default: 5
*   `apply_to_each_line` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_drop_bytes", "arguments": { "input": "..." } }
```

---

#### Take bytes (`cyberchef_take_bytes`)
Takes a slice of the specified number of bytes from the data. Negative values are allowed.

**Arguments:**
*   `start` (number): Default: 0
*   `length` (number): Default: 5
*   `apply_to_each_line` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_take_bytes", "arguments": { "input": "..." } }
```

---

#### Pad lines (`cyberchef_pad_lines`)
Add the specified number of the specified character to the beginning or end of each line

**Arguments:**
*   `position` (Enum: [Start, End]): Default: Start,End
*   `length` (number): Default: 5
*   `character` (binaryShortString): Default:  

**Example:**
```json
{ "name": "cyberchef_pad_lines", "arguments": { "input": "..." } }
```

---

#### Find / Replace (`cyberchef_find_replace`)
Replaces all occurrences of the first string with the second.

Includes support for regular expressions (regex), simple strings and extended strings (which support \n, \r, \t, \b, \f and escaped hex bytes using \x notation, e.g. \x00 for a null byte).

**Arguments:**
*   `find` (toggleString): Default: ""
*   `replace` (binaryString): Default: ""
*   `global_match` (boolean): Default: true
*   `case_insensitive` (boolean): Default: false
*   `multiline_matching` (boolean): Default: true
*   `dot_matches_all` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_find_replace", "arguments": { "input": "..." } }
```

---

#### Regular expression (`cyberchef_regular_expression`)
Define your own regular expression (regex) to search the input data with, optionally choosing from a list of pre-defined patterns.

Supports extended regex syntax including the 'dot matches all' flag, named capture groups, full unicode coverage (including \p{} categories and scripts as well as astral codes) and recursive matching.

**Arguments:**
*   `built_in_regexes` (populateOption): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `regex` (text): Default: ""
*   `case_insensitive` (boolean): Default: true
*   `^_and_$_match_at_newlines` (boolean): Default: true
*   `dot_matches_all` (boolean): Default: false
*   `unicode_support` (boolean): Default: false
*   `astral_support` (boolean): Default: false
*   `display_total` (boolean): Default: false
*   `output_format` (Enum: [Highlight matches, List matches, List capture groups, List matches with capture groups]): Default: Highlight matches,List matches,List capture groups,List matches with capture groups

**Example:**
```json
{ "name": "cyberchef_regular_expression", "arguments": { "input": "..." } }
```

---

#### Fuzzy Match (`cyberchef_fuzzy_match`)
Conducts a fuzzy search to find a pattern within the input based on weighted criteria.

e.g. A search for dpan will match on Don't Panic

**Arguments:**
*   `search` (binaryString): Default: ""
*   `sequential_bonus` (number): Default: 15
*   `separator_bonus` (number): Default: 30
*   `camel_bonus` (number): Default: 30
*   `first_letter_bonus` (number): Default: 15
*   `leading_letter_penalty` (number): Default: -5
*   `max_leading_letter_penalty` (number): Default: -15
*   `unmatched_letter_penalty` (number): Default: -1

**Example:**
```json
{ "name": "cyberchef_fuzzy_match", "arguments": { "input": "..." } }
```

---

#### Offset checker (`cyberchef_offset_checker`)
Compares multiple inputs (separated by the specified delimiter) and highlights matching characters which appear at the same position in all samples.

**Arguments:**
*   `sample_delimiter` (binaryString): Default: \n\n

**Example:**
```json
{ "name": "cyberchef_offset_checker", "arguments": { "input": "..." } }
```

---

#### Hamming Distance (`cyberchef_hamming_distance`)
In information theory, the Hamming distance between two strings of equal length is the number of positions at which the corresponding symbols are different. In other words, it measures the minimum number of substitutions required to change one string into the other, or the minimum number of errors that could have transformed one string into the other. In a more general context, the Hamming distance is one of several string metrics for measuring the edit distance between two sequences.

**Arguments:**
*   `delimiter` (binaryShortString): Default: \n\n
*   `unit` (Enum: [Byte, Bit]): Default: Byte,Bit
*   `input_type` (Enum: [Raw string, Hex]): Default: Raw string,Hex

**Example:**
```json
{ "name": "cyberchef_hamming_distance", "arguments": { "input": "..." } }
```

---

#### Levenshtein Distance (`cyberchef_levenshtein_distance`)
Levenshtein Distance (also known as Edit Distance) is a string metric to measure a difference between two strings that counts operations (insertions, deletions, and substitutions) on single character that are required to change one string to another.

**Arguments:**
*   `sample_delimiter` (binaryString): Default: \n
*   `insertion_cost` (number): Default: 1
*   `deletion_cost` (number): Default: 1
*   `substitution_cost` (number): Default: 1

**Example:**
```json
{ "name": "cyberchef_levenshtein_distance", "arguments": { "input": "..." } }
```

---

#### Convert distance (`cyberchef_convert_distance`)
Converts a unit of distance to another format.

**Arguments:**
*   `input_units` (Enum: [[Metric], Nanometres (nm), Micrometres (µm), Millimetres (mm), Centimetres (cm), ...]): Default: [Metric],Nanometres (nm),Micrometres (µm),Millimetres (mm),Centimetres (cm),Metres (m),Kilometers (km),[/Metric],[Imperial],Thou (th),Inches (in),Feet (ft),Yards (yd),Chains (ch),Furlongs (fur),Miles (mi),Leagues (lea),[/Imperial],[Maritime],Fathoms (ftm),Cables,Nautical miles,[/Maritime],[Comparisons],Cars (4m),Buses (8.4m),American football fields (91m),Football pitches (105m),[/Comparisons],[Astronomical],Earth-to-Moons,Earth's equators,Astronomical units (au),Light-years (ly),Parsecs (pc),[/Astronomical]
*   `output_units` (Enum: [[Metric], Nanometres (nm), Micrometres (µm), Millimetres (mm), Centimetres (cm), ...]): Default: [Metric],Nanometres (nm),Micrometres (µm),Millimetres (mm),Centimetres (cm),Metres (m),Kilometers (km),[/Metric],[Imperial],Thou (th),Inches (in),Feet (ft),Yards (yd),Chains (ch),Furlongs (fur),Miles (mi),Leagues (lea),[/Imperial],[Maritime],Fathoms (ftm),Cables,Nautical miles,[/Maritime],[Comparisons],Cars (4m),Buses (8.4m),American football fields (91m),Football pitches (105m),[/Comparisons],[Astronomical],Earth-to-Moons,Earth's equators,Astronomical units (au),Light-years (ly),Parsecs (pc),[/Astronomical]

**Example:**
```json
{ "name": "cyberchef_convert_distance", "arguments": { "input": "..." } }
```

---

#### Convert area (`cyberchef_convert_area`)
Converts a unit of area to another format.

**Arguments:**
*   `input_units` (Enum: [[Metric], Square metre (sq m), Square kilometre (sq km), Centiare (ca), Deciare (da), ...]): Default: [Metric],Square metre (sq m),Square kilometre (sq km),Centiare (ca),Deciare (da),Are (a),Decare (daa),Hectare (ha),[/Metric],[Imperial],Square inch (sq in),Square foot (sq ft),Square yard (sq yd),Square mile (sq mi),Perch (sq per),Rood (ro),International acre (ac),[/Imperial],[US customary units],US survey acre (ac),US survey square mile (sq mi),US survey township,[/US customary units],[Nuclear physics],Yoctobarn (yb),Zeptobarn (zb),Attobarn (ab),Femtobarn (fb),Picobarn (pb),Nanobarn (nb),Microbarn (μb),Millibarn (mb),Barn (b),Kilobarn (kb),Megabarn (Mb),Outhouse,Shed,Planck area,[/Nuclear physics],[Comparisons],Washington D.C.,Isle of Wight,Wales,Texas,[/Comparisons]
*   `output_units` (Enum: [[Metric], Square metre (sq m), Square kilometre (sq km), Centiare (ca), Deciare (da), ...]): Default: [Metric],Square metre (sq m),Square kilometre (sq km),Centiare (ca),Deciare (da),Are (a),Decare (daa),Hectare (ha),[/Metric],[Imperial],Square inch (sq in),Square foot (sq ft),Square yard (sq yd),Square mile (sq mi),Perch (sq per),Rood (ro),International acre (ac),[/Imperial],[US customary units],US survey acre (ac),US survey square mile (sq mi),US survey township,[/US customary units],[Nuclear physics],Yoctobarn (yb),Zeptobarn (zb),Attobarn (ab),Femtobarn (fb),Picobarn (pb),Nanobarn (nb),Microbarn (μb),Millibarn (mb),Barn (b),Kilobarn (kb),Megabarn (Mb),Outhouse,Shed,Planck area,[/Nuclear physics],[Comparisons],Washington D.C.,Isle of Wight,Wales,Texas,[/Comparisons]

**Example:**
```json
{ "name": "cyberchef_convert_area", "arguments": { "input": "..." } }
```

---

#### Convert mass (`cyberchef_convert_mass`)
Converts a unit of mass to another format.

**Arguments:**
*   `input_units` (Enum: [[Metric], Yoctogram (yg), Zeptogram (zg), Attogram (ag), Femtogram (fg), ...]): Default: [Metric],Yoctogram (yg),Zeptogram (zg),Attogram (ag),Femtogram (fg),Picogram (pg),Nanogram (ng),Microgram (μg),Milligram (mg),Centigram (cg),Decigram (dg),Gram (g),Decagram (dag),Hectogram (hg),Kilogram (kg),Megagram (Mg),Tonne (t),Gigagram (Gg),Teragram (Tg),Petagram (Pg),Exagram (Eg),Zettagram (Zg),Yottagram (Yg),[/Metric],[Imperial Avoirdupois],Grain (gr),Dram (dr),Ounce (oz),Pound (lb),Nail,Stone (st),Quarter (gr),Tod,US hundredweight (cwt),Imperial hundredweight (cwt),US ton (t),Imperial ton (t),[/Imperial Avoirdupois],[Imperial Troy],Grain (gr),Pennyweight (dwt),Troy dram (dr t),Troy ounce (oz t),Troy pound (lb t),Mark,[/Imperial Troy],[Archaic],Wey,Wool wey,Suffolk wey,Wool sack,Coal sack,Load,Last,Flax or feather last,Gunpowder last,Picul,Rice last,[/Archaic],[Comparisons],Big Ben (14 tonnes),Blue whale (180 tonnes),International Space Station (417 tonnes),Space Shuttle (2,041 tonnes),RMS Titanic (52,000 tonnes),Great Pyramid of Giza (6,000,000 tonnes),Earth's oceans (1.4 yottagrams),[/Comparisons],[Astronomical],A teaspoon of neutron star (5,500 million tonnes),Lunar mass (ML),Earth mass (M⊕),Jupiter mass (MJ),Solar mass (M☉),Sagittarius A* (7.5 x 10^36 kgs-ish),Milky Way galaxy (1.2 x 10^42 kgs),The observable universe (1.45 x 10^53 kgs),[/Astronomical]
*   `output_units` (Enum: [[Metric], Yoctogram (yg), Zeptogram (zg), Attogram (ag), Femtogram (fg), ...]): Default: [Metric],Yoctogram (yg),Zeptogram (zg),Attogram (ag),Femtogram (fg),Picogram (pg),Nanogram (ng),Microgram (μg),Milligram (mg),Centigram (cg),Decigram (dg),Gram (g),Decagram (dag),Hectogram (hg),Kilogram (kg),Megagram (Mg),Tonne (t),Gigagram (Gg),Teragram (Tg),Petagram (Pg),Exagram (Eg),Zettagram (Zg),Yottagram (Yg),[/Metric],[Imperial Avoirdupois],Grain (gr),Dram (dr),Ounce (oz),Pound (lb),Nail,Stone (st),Quarter (gr),Tod,US hundredweight (cwt),Imperial hundredweight (cwt),US ton (t),Imperial ton (t),[/Imperial Avoirdupois],[Imperial Troy],Grain (gr),Pennyweight (dwt),Troy dram (dr t),Troy ounce (oz t),Troy pound (lb t),Mark,[/Imperial Troy],[Archaic],Wey,Wool wey,Suffolk wey,Wool sack,Coal sack,Load,Last,Flax or feather last,Gunpowder last,Picul,Rice last,[/Archaic],[Comparisons],Big Ben (14 tonnes),Blue whale (180 tonnes),International Space Station (417 tonnes),Space Shuttle (2,041 tonnes),RMS Titanic (52,000 tonnes),Great Pyramid of Giza (6,000,000 tonnes),Earth's oceans (1.4 yottagrams),[/Comparisons],[Astronomical],A teaspoon of neutron star (5,500 million tonnes),Lunar mass (ML),Earth mass (M⊕),Jupiter mass (MJ),Solar mass (M☉),Sagittarius A* (7.5 x 10^36 kgs-ish),Milky Way galaxy (1.2 x 10^42 kgs),The observable universe (1.45 x 10^53 kgs),[/Astronomical]

**Example:**
```json
{ "name": "cyberchef_convert_mass", "arguments": { "input": "..." } }
```

---

#### Convert speed (`cyberchef_convert_speed`)
Converts a unit of speed to another format.

**Arguments:**
*   `input_units` (Enum: [[Metric], Metres per second (m/s), Kilometres per hour (km/h), [/Metric], [Imperial], ...]): Default: [Metric],Metres per second (m/s),Kilometres per hour (km/h),[/Metric],[Imperial],Miles per hour (mph),Knots (kn),[/Imperial],[Comparisons],Human hair growth rate,Bamboo growth rate,World's fastest snail,Usain Bolt's top speed,Jet airliner cruising speed,Concorde,SR-71 Blackbird,Space Shuttle,International Space Station,[/Comparisons],[Scientific],Sound in standard atmosphere,Sound in water,Lunar escape velocity,Earth escape velocity,Earth's solar orbit,Solar system's Milky Way orbit,Milky Way relative to the cosmic microwave background,Solar escape velocity,Neutron star escape velocity (0.3c),Light in a diamond (0.4136c),Signal in an optical fibre (0.667c),Light (c),[/Scientific]
*   `output_units` (Enum: [[Metric], Metres per second (m/s), Kilometres per hour (km/h), [/Metric], [Imperial], ...]): Default: [Metric],Metres per second (m/s),Kilometres per hour (km/h),[/Metric],[Imperial],Miles per hour (mph),Knots (kn),[/Imperial],[Comparisons],Human hair growth rate,Bamboo growth rate,World's fastest snail,Usain Bolt's top speed,Jet airliner cruising speed,Concorde,SR-71 Blackbird,Space Shuttle,International Space Station,[/Comparisons],[Scientific],Sound in standard atmosphere,Sound in water,Lunar escape velocity,Earth escape velocity,Earth's solar orbit,Solar system's Milky Way orbit,Milky Way relative to the cosmic microwave background,Solar escape velocity,Neutron star escape velocity (0.3c),Light in a diamond (0.4136c),Signal in an optical fibre (0.667c),Light (c),[/Scientific]

**Example:**
```json
{ "name": "cyberchef_convert_speed", "arguments": { "input": "..." } }
```

---

#### Convert data units (`cyberchef_convert_data_units`)
Converts a unit of data to another format.

**Arguments:**
*   `input_units` (Enum: [Bits (b), Nibbles, Octets, Bytes (B), [Binary bits (2^n)], ...]): Default: Bits (b),Nibbles,Octets,Bytes (B),[Binary bits (2^n)],Kibibits (Kib),Mebibits (Mib),Gibibits (Gib),Tebibits (Tib),Pebibits (Pib),Exbibits (Eib),Zebibits (Zib),Yobibits (Yib),[/Binary bits (2^n)],[Decimal bits (10^n)],Decabits,Hectobits,Kilobits (Kb),Megabits (Mb),Gigabits (Gb),Terabits (Tb),Petabits (Pb),Exabits (Eb),Zettabits (Zb),Yottabits (Yb),[/Decimal bits (10^n)],[Binary bytes (8 x 2^n)],Kibibytes (KiB),Mebibytes (MiB),Gibibytes (GiB),Tebibytes (TiB),Pebibytes (PiB),Exbibytes (EiB),Zebibytes (ZiB),Yobibytes (YiB),[/Binary bytes (8 x 2^n)],[Decimal bytes (8 x 10^n)],Kilobytes (KB),Megabytes (MB),Gigabytes (GB),Terabytes (TB),Petabytes (PB),Exabytes (EB),Zettabytes (ZB),Yottabytes (YB),[/Decimal bytes (8 x 10^n)]
*   `output_units` (Enum: [Bits (b), Nibbles, Octets, Bytes (B), [Binary bits (2^n)], ...]): Default: Bits (b),Nibbles,Octets,Bytes (B),[Binary bits (2^n)],Kibibits (Kib),Mebibits (Mib),Gibibits (Gib),Tebibits (Tib),Pebibits (Pib),Exbibits (Eib),Zebibits (Zib),Yobibits (Yib),[/Binary bits (2^n)],[Decimal bits (10^n)],Decabits,Hectobits,Kilobits (Kb),Megabits (Mb),Gigabits (Gb),Terabits (Tb),Petabits (Pb),Exabits (Eb),Zettabits (Zb),Yottabits (Yb),[/Decimal bits (10^n)],[Binary bytes (8 x 2^n)],Kibibytes (KiB),Mebibytes (MiB),Gibibytes (GiB),Tebibytes (TiB),Pebibytes (PiB),Exbibytes (EiB),Zebibytes (ZiB),Yobibytes (YiB),[/Binary bytes (8 x 2^n)],[Decimal bytes (8 x 10^n)],Kilobytes (KB),Megabytes (MB),Gigabytes (GB),Terabytes (TB),Petabytes (PB),Exabytes (EB),Zettabytes (ZB),Yottabytes (YB),[/Decimal bytes (8 x 10^n)]

**Example:**
```json
{ "name": "cyberchef_convert_data_units", "arguments": { "input": "..." } }
```

---

#### Convert co-ordinate format (`cyberchef_convert_co_ordinate_format`)
Converts geographical coordinates between different formats.

Supported formats:Degrees Minutes Seconds (DMS)Degrees Decimal Minutes (DDM)Decimal Degrees (DD)GeohashMilitary Grid Reference System (MGRS)Ordnance Survey National Grid (OSNG)Universal Transverse Mercator (UTM)
The operation can try to detect the input co-ordinate format and delimiter automatically, but this may not always work correctly.

**Arguments:**
*   `input_format` (Enum: [Auto, Degrees Minutes Seconds, Degrees Decimal Minutes, Decimal Degrees, Geohash, ...]): Default: Auto,Degrees Minutes Seconds,Degrees Decimal Minutes,Decimal Degrees,Geohash,Military Grid Reference System,Ordnance Survey National Grid,Universal Transverse Mercator
*   `input_delimiter` (Enum: [Auto, Direction Preceding, Direction Following, \n, Comma, ...]): Default: Auto,Direction Preceding,Direction Following,\n,Comma,Semi-colon,Colon
*   `output_format` (Enum: [Degrees Minutes Seconds, Degrees Decimal Minutes, Decimal Degrees, Geohash, Military Grid Reference System, ...]): Default: Degrees Minutes Seconds,Degrees Decimal Minutes,Decimal Degrees,Geohash,Military Grid Reference System,Ordnance Survey National Grid,Universal Transverse Mercator
*   `output_delimiter` (Enum: [Space, \n, Comma, Semi-colon, Colon]): Default: Space,\n,Comma,Semi-colon,Colon
*   `include_compass_directions` (Enum: [None, Before, After]): Default: None,Before,After
*   `precision` (number): Default: 3

**Example:**
```json
{ "name": "cyberchef_convert_co_ordinate_format", "arguments": { "input": "..." } }
```

---

#### Show on map (`cyberchef_show_on_map`)
Displays co-ordinates on a slippy map.

Co-ordinates will be converted to decimal degrees before being shown on the map.

Supported formats:Degrees Minutes Seconds (DMS)Degrees Decimal Minutes (DDM)Decimal Degrees (DD)GeohashMilitary Grid Reference System (MGRS)Ordnance Survey National Grid (OSNG)Universal Transverse Mercator (UTM)
This operation will not work offline.

**Arguments:**
*   `zoom_level` (number): Default: 13
*   `input_format` (Enum: [Auto, Degrees Minutes Seconds, Degrees Decimal Minutes, Decimal Degrees, Geohash, ...]): Default: Auto,Degrees Minutes Seconds,Degrees Decimal Minutes,Decimal Degrees,Geohash,Military Grid Reference System,Ordnance Survey National Grid,Universal Transverse Mercator
*   `input_delimiter` (Enum: [Auto, Direction Preceding, Direction Following, \n, Comma, ...]): Default: Auto,Direction Preceding,Direction Following,\n,Comma,Semi-colon,Colon

**Example:**
```json
{ "name": "cyberchef_show_on_map", "arguments": { "input": "..." } }
```

---

#### Parse UNIX file permissions (`cyberchef_parse_unix_file_permissions`)
Given a UNIX/Linux file permission string in octal or textual format, this operation explains which permissions are granted to which user groups.

Input should be in either octal (e.g. 755) or textual (e.g. drwxr-xr-x) format.

**Example:**
```json
{ "name": "cyberchef_parse_unix_file_permissions", "arguments": { "input": "..." } }
```

---

#### Parse ObjectID timestamp (`cyberchef_parse_objectid_timestamp`)
Parse timestamp from MongoDB/BSON ObjectID hex string.

**Example:**
```json
{ "name": "cyberchef_parse_objectid_timestamp", "arguments": { "input": "..." } }
```

---

#### Swap endianness (`cyberchef_swap_endianness`)
Switches the data from big-endian to little-endian or vice-versa. Data can be read in as hexadecimal or raw bytes. It will be returned in the same format as it is entered.

**Arguments:**
*   `data_format` (Enum: [Hex, Raw]): Default: Hex,Raw
*   `word_length_(bytes)` (number): Default: 4
*   `pad_incomplete_words` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_swap_endianness", "arguments": { "input": "..." } }
```

---

#### Parse colour code (`cyberchef_parse_colour_code`)
Converts a colour code in a standard format to other standard formats and displays the colour itself.

Example inputs#d9edf7rgba(217,237,247,1)hsla(200,65%,91%,1)cmyk(0.12, 0.04, 0.00, 0.03)

**Example:**
```json
{ "name": "cyberchef_parse_colour_code", "arguments": { "input": "..." } }
```

---

#### Escape string (`cyberchef_escape_string`)
Escapes special characters in a string so that they do not cause conflicts. For example, Don't stop me now becomes Don\'t stop me now.

Supports the following escape sequences:\n (Line feed/newline)\r (Carriage return)\t (Horizontal tab)\b (Backspace)\f (Form feed)\xnn (Hex, where n is 0-f)\\ (Backslash)\' (Single quote)\&quot; (Double quote)\unnnn (Unicode character)\u{nnnnnn} (Unicode code point)

**Arguments:**
*   `escape_level` (Enum: [Special chars, Everything, Minimal]): Default: Special chars,Everything,Minimal
*   `escape_quote` (Enum: [Single, Double, Backtick]): Default: Single,Double,Backtick
*   `json_compatible` (boolean): Default: false
*   `es6_compatible` (boolean): Default: true
*   `uppercase_hex` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_escape_string", "arguments": { "input": "..." } }
```

---

#### Unescape string (`cyberchef_unescape_string`)
Unescapes characters in a string that have been escaped. For example, Don\'t stop me now becomes Don't stop me now.

Supports the following escape sequences:\n (Line feed/newline)\r (Carriage return)\t (Horizontal tab)\b (Backspace)\f (Form feed)\nnn (Octal, where n is 0-7)\xnn (Hex, where n is 0-f)\\ (Backslash)\' (Single quote)\&quot; (Double quote)\unnnn (Unicode character)\u{nnnnnn} (Unicode code point)

**Example:**
```json
{ "name": "cyberchef_unescape_string", "arguments": { "input": "..." } }
```

---

#### Pseudo-Random Number Generator (`cyberchef_pseudo_random_number_generator`)
A cryptographically-secure pseudo-random number generator (PRNG).

This operation uses the browser's built-in crypto.getRandomValues() method if available. If this cannot be found, it falls back to a Fortuna-based PRNG algorithm.

**Arguments:**
*   `number_of_bytes` (number): Default: 32
*   `output_as` (Enum: [Hex, Integer, Byte array, Raw]): Default: Hex,Integer,Byte array,Raw

**Example:**
```json
{ "name": "cyberchef_pseudo_random_number_generator", "arguments": { "input": "..." } }
```

---

#### Sleep (`cyberchef_sleep`)
Sleep causes the recipe to wait for a specified number of milliseconds before continuing execution.

**Arguments:**
*   `time_(ms)` (number): Default: 1000

**Example:**
```json
{ "name": "cyberchef_sleep", "arguments": { "input": "..." } }
```

---

#### File Tree (`cyberchef_file_tree`)
Creates a file tree from a list of file paths (similar to the tree command in Linux)

**Arguments:**
*   `file_path_delimiter` (binaryString): Default: /
*   `delimiter` (Enum: [Line feed, CRLF, Space, Comma, Semi-colon, ...]): Default: Line feed,CRLF,Space,Comma,Semi-colon,Colon,Nothing (separate chars)

**Example:**
```json
{ "name": "cyberchef_file_tree", "arguments": { "input": "..." } }
```

---

#### Take nth bytes (`cyberchef_take_nth_bytes`)
Takes every nth byte starting with a given byte.

**Arguments:**
*   `take_every` (number): Default: 4
*   `starting_at` (number): Default: 0
*   `apply_to_each_line` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_take_nth_bytes", "arguments": { "input": "..." } }
```

---

#### Drop nth bytes (`cyberchef_drop_nth_bytes`)
Drops every nth byte starting with a given byte.

**Arguments:**
*   `drop_every` (number): Default: 4
*   `starting_at` (number): Default: 0
*   `apply_to_each_line` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_drop_nth_bytes", "arguments": { "input": "..." } }
```

---

### Date / Time

#### Parse DateTime (`cyberchef_parse_datetime`)
Parses a DateTime string in your specified format and displays it in whichever timezone you choose with the following information:DateTimePeriod (AM/PM)TimezoneUTC offsetDaylight Saving TimeLeap yearDays in this monthDay of yearWeek numberQuarterRun with no input to see format string examples if required.

**Arguments:**
*   `built_in_formats` (populateOption): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `input_format_string` (binaryString): Default: DD/MM/YYYY HH:mm:ss
*   `input_timezone` (Enum: [UTC, Africa/Abidjan, Africa/Accra, Africa/Addis_Ababa, Africa/Algiers, ...]): Default: UTC,Africa/Abidjan,Africa/Accra,Africa/Addis_Ababa,Africa/Algiers,Africa/Asmara,Africa/Asmera,Africa/Bamako,Africa/Bangui,Africa/Banjul,Africa/Bissau,Africa/Blantyre,Africa/Brazzaville,Africa/Bujumbura,Africa/Cairo,Africa/Casablanca,Africa/Ceuta,Africa/Conakry,Africa/Dakar,Africa/Dar_es_Salaam,Africa/Djibouti,Africa/Douala,Africa/El_Aaiun,Africa/Freetown,Africa/Gaborone,Africa/Harare,Africa/Johannesburg,Africa/Juba,Africa/Kampala,Africa/Khartoum,Africa/Kigali,Africa/Kinshasa,Africa/Lagos,Africa/Libreville,Africa/Lome,Africa/Luanda,Africa/Lubumbashi,Africa/Lusaka,Africa/Malabo,Africa/Maputo,Africa/Maseru,Africa/Mbabane,Africa/Mogadishu,Africa/Monrovia,Africa/Nairobi,Africa/Ndjamena,Africa/Niamey,Africa/Nouakchott,Africa/Ouagadougou,Africa/Porto-Novo,Africa/Sao_Tome,Africa/Timbuktu,Africa/Tripoli,Africa/Tunis,Africa/Windhoek,America/Adak,America/Anchorage,America/Anguilla,America/Antigua,America/Araguaina,America/Argentina/Buenos_Aires,America/Argentina/Catamarca,America/Argentina/ComodRivadavia,America/Argentina/Cordoba,America/Argentina/Jujuy,America/Argentina/La_Rioja,America/Argentina/Mendoza,America/Argentina/Rio_Gallegos,America/Argentina/Salta,America/Argentina/San_Juan,America/Argentina/San_Luis,America/Argentina/Tucuman,America/Argentina/Ushuaia,America/Aruba,America/Asuncion,America/Atikokan,America/Atka,America/Bahia,America/Bahia_Banderas,America/Barbados,America/Belem,America/Belize,America/Blanc-Sablon,America/Boa_Vista,America/Bogota,America/Boise,America/Buenos_Aires,America/Cambridge_Bay,America/Campo_Grande,America/Cancun,America/Caracas,America/Catamarca,America/Cayenne,America/Cayman,America/Chicago,America/Chihuahua,America/Ciudad_Juarez,America/Coral_Harbour,America/Cordoba,America/Costa_Rica,America/Creston,America/Cuiaba,America/Curacao,America/Danmarkshavn,America/Dawson,America/Dawson_Creek,America/Denver,America/Detroit,America/Dominica,America/Edmonton,America/Eirunepe,America/El_Salvador,America/Ensenada,America/Fort_Nelson,America/Fort_Wayne,America/Fortaleza,America/Glace_Bay,America/Godthab,America/Goose_Bay,America/Grand_Turk,America/Grenada,America/Guadeloupe,America/Guatemala,America/Guayaquil,America/Guyana,America/Halifax,America/Havana,America/Hermosillo,America/Indiana/Indianapolis,America/Indiana/Knox,America/Indiana/Marengo,America/Indiana/Petersburg,America/Indiana/Tell_City,America/Indiana/Vevay,America/Indiana/Vincennes,America/Indiana/Winamac,America/Indianapolis,America/Inuvik,America/Iqaluit,America/Jamaica,America/Jujuy,America/Juneau,America/Kentucky/Louisville,America/Kentucky/Monticello,America/Knox_IN,America/Kralendijk,America/La_Paz,America/Lima,America/Los_Angeles,America/Louisville,America/Lower_Princes,America/Maceio,America/Managua,America/Manaus,America/Marigot,America/Martinique,America/Matamoros,America/Mazatlan,America/Mendoza,America/Menominee,America/Merida,America/Metlakatla,America/Mexico_City,America/Miquelon,America/Moncton,America/Monterrey,America/Montevideo,America/Montreal,America/Montserrat,America/Nassau,America/New_York,America/Nipigon,America/Nome,America/Noronha,America/North_Dakota/Beulah,America/North_Dakota/Center,America/North_Dakota/New_Salem,America/Nuuk,America/Ojinaga,America/Panama,America/Pangnirtung,America/Paramaribo,America/Phoenix,America/Port-au-Prince,America/Port_of_Spain,America/Porto_Acre,America/Porto_Velho,America/Puerto_Rico,America/Punta_Arenas,America/Rainy_River,America/Rankin_Inlet,America/Recife,America/Regina,America/Resolute,America/Rio_Branco,America/Rosario,America/Santa_Isabel,America/Santarem,America/Santiago,America/Santo_Domingo,America/Sao_Paulo,America/Scoresbysund,America/Shiprock,America/Sitka,America/St_Barthelemy,America/St_Johns,America/St_Kitts,America/St_Lucia,America/St_Thomas,America/St_Vincent,America/Swift_Current,America/Tegucigalpa,America/Thule,America/Thunder_Bay,America/Tijuana,America/Toronto,America/Tortola,America/Vancouver,America/Virgin,America/Whitehorse,America/Winnipeg,America/Yakutat,America/Yellowknife,Antarctica/Casey,Antarctica/Davis,Antarctica/DumontDUrville,Antarctica/Macquarie,Antarctica/Mawson,Antarctica/McMurdo,Antarctica/Palmer,Antarctica/Rothera,Antarctica/South_Pole,Antarctica/Syowa,Antarctica/Troll,Antarctica/Vostok,Arctic/Longyearbyen,Asia/Aden,Asia/Almaty,Asia/Amman,Asia/Anadyr,Asia/Aqtau,Asia/Aqtobe,Asia/Ashgabat,Asia/Ashkhabad,Asia/Atyrau,Asia/Baghdad,Asia/Bahrain,Asia/Baku,Asia/Bangkok,Asia/Barnaul,Asia/Beirut,Asia/Bishkek,Asia/Brunei,Asia/Calcutta,Asia/Chita,Asia/Choibalsan,Asia/Chongqing,Asia/Chungking,Asia/Colombo,Asia/Dacca,Asia/Damascus,Asia/Dhaka,Asia/Dili,Asia/Dubai,Asia/Dushanbe,Asia/Famagusta,Asia/Gaza,Asia/Harbin,Asia/Hebron,Asia/Ho_Chi_Minh,Asia/Hong_Kong,Asia/Hovd,Asia/Irkutsk,Asia/Istanbul,Asia/Jakarta,Asia/Jayapura,Asia/Jerusalem,Asia/Kabul,Asia/Kamchatka,Asia/Karachi,Asia/Kashgar,Asia/Kathmandu,Asia/Katmandu,Asia/Khandyga,Asia/Kolkata,Asia/Krasnoyarsk,Asia/Kuala_Lumpur,Asia/Kuching,Asia/Kuwait,Asia/Macao,Asia/Macau,Asia/Magadan,Asia/Makassar,Asia/Manila,Asia/Muscat,Asia/Nicosia,Asia/Novokuznetsk,Asia/Novosibirsk,Asia/Omsk,Asia/Oral,Asia/Phnom_Penh,Asia/Pontianak,Asia/Pyongyang,Asia/Qatar,Asia/Qostanay,Asia/Qyzylorda,Asia/Rangoon,Asia/Riyadh,Asia/Saigon,Asia/Sakhalin,Asia/Samarkand,Asia/Seoul,Asia/Shanghai,Asia/Singapore,Asia/Srednekolymsk,Asia/Taipei,Asia/Tashkent,Asia/Tbilisi,Asia/Tehran,Asia/Tel_Aviv,Asia/Thimbu,Asia/Thimphu,Asia/Tokyo,Asia/Tomsk,Asia/Ujung_Pandang,Asia/Ulaanbaatar,Asia/Ulan_Bator,Asia/Urumqi,Asia/Ust-Nera,Asia/Vientiane,Asia/Vladivostok,Asia/Yakutsk,Asia/Yangon,Asia/Yekaterinburg,Asia/Yerevan,Atlantic/Azores,Atlantic/Bermuda,Atlantic/Canary,Atlantic/Cape_Verde,Atlantic/Faeroe,Atlantic/Faroe,Atlantic/Jan_Mayen,Atlantic/Madeira,Atlantic/Reykjavik,Atlantic/South_Georgia,Atlantic/St_Helena,Atlantic/Stanley,Australia/ACT,Australia/Adelaide,Australia/Brisbane,Australia/Broken_Hill,Australia/Canberra,Australia/Currie,Australia/Darwin,Australia/Eucla,Australia/Hobart,Australia/LHI,Australia/Lindeman,Australia/Lord_Howe,Australia/Melbourne,Australia/NSW,Australia/North,Australia/Perth,Australia/Queensland,Australia/South,Australia/Sydney,Australia/Tasmania,Australia/Victoria,Australia/West,Australia/Yancowinna,Brazil/Acre,Brazil/DeNoronha,Brazil/East,Brazil/West,CET,CST6CDT,Canada/Atlantic,Canada/Central,Canada/Eastern,Canada/Mountain,Canada/Newfoundland,Canada/Pacific,Canada/Saskatchewan,Canada/Yukon,Chile/Continental,Chile/EasterIsland,Cuba,EET,EST,EST5EDT,Egypt,Eire,Etc/GMT,Etc/GMT+0,Etc/GMT+1,Etc/GMT+10,Etc/GMT+11,Etc/GMT+12,Etc/GMT+2,Etc/GMT+3,Etc/GMT+4,Etc/GMT+5,Etc/GMT+6,Etc/GMT+7,Etc/GMT+8,Etc/GMT+9,Etc/GMT-0,Etc/GMT-1,Etc/GMT-10,Etc/GMT-11,Etc/GMT-12,Etc/GMT-13,Etc/GMT-14,Etc/GMT-2,Etc/GMT-3,Etc/GMT-4,Etc/GMT-5,Etc/GMT-6,Etc/GMT-7,Etc/GMT-8,Etc/GMT-9,Etc/GMT0,Etc/Greenwich,Etc/UCT,Etc/UTC,Etc/Universal,Etc/Zulu,Europe/Amsterdam,Europe/Andorra,Europe/Astrakhan,Europe/Athens,Europe/Belfast,Europe/Belgrade,Europe/Berlin,Europe/Bratislava,Europe/Brussels,Europe/Bucharest,Europe/Budapest,Europe/Busingen,Europe/Chisinau,Europe/Copenhagen,Europe/Dublin,Europe/Gibraltar,Europe/Guernsey,Europe/Helsinki,Europe/Isle_of_Man,Europe/Istanbul,Europe/Jersey,Europe/Kaliningrad,Europe/Kiev,Europe/Kirov,Europe/Kyiv,Europe/Lisbon,Europe/Ljubljana,Europe/London,Europe/Luxembourg,Europe/Madrid,Europe/Malta,Europe/Mariehamn,Europe/Minsk,Europe/Monaco,Europe/Moscow,Europe/Nicosia,Europe/Oslo,Europe/Paris,Europe/Podgorica,Europe/Prague,Europe/Riga,Europe/Rome,Europe/Samara,Europe/San_Marino,Europe/Sarajevo,Europe/Saratov,Europe/Simferopol,Europe/Skopje,Europe/Sofia,Europe/Stockholm,Europe/Tallinn,Europe/Tirane,Europe/Tiraspol,Europe/Ulyanovsk,Europe/Uzhgorod,Europe/Vaduz,Europe/Vatican,Europe/Vienna,Europe/Vilnius,Europe/Volgograd,Europe/Warsaw,Europe/Zagreb,Europe/Zaporozhye,Europe/Zurich,GB,GB-Eire,GMT,GMT+0,GMT-0,GMT0,Greenwich,HST,Hongkong,Iceland,Indian/Antananarivo,Indian/Chagos,Indian/Christmas,Indian/Cocos,Indian/Comoro,Indian/Kerguelen,Indian/Mahe,Indian/Maldives,Indian/Mauritius,Indian/Mayotte,Indian/Reunion,Iran,Israel,Jamaica,Japan,Kwajalein,Libya,MET,MST,MST7MDT,Mexico/BajaNorte,Mexico/BajaSur,Mexico/General,NZ,NZ-CHAT,Navajo,PRC,PST8PDT,Pacific/Apia,Pacific/Auckland,Pacific/Bougainville,Pacific/Chatham,Pacific/Chuuk,Pacific/Easter,Pacific/Efate,Pacific/Enderbury,Pacific/Fakaofo,Pacific/Fiji,Pacific/Funafuti,Pacific/Galapagos,Pacific/Gambier,Pacific/Guadalcanal,Pacific/Guam,Pacific/Honolulu,Pacific/Johnston,Pacific/Kanton,Pacific/Kiritimati,Pacific/Kosrae,Pacific/Kwajalein,Pacific/Majuro,Pacific/Marquesas,Pacific/Midway,Pacific/Nauru,Pacific/Niue,Pacific/Norfolk,Pacific/Noumea,Pacific/Pago_Pago,Pacific/Palau,Pacific/Pitcairn,Pacific/Pohnpei,Pacific/Ponape,Pacific/Port_Moresby,Pacific/Rarotonga,Pacific/Saipan,Pacific/Samoa,Pacific/Tahiti,Pacific/Tarawa,Pacific/Tongatapu,Pacific/Truk,Pacific/Wake,Pacific/Wallis,Pacific/Yap,Poland,Portugal,ROC,ROK,Singapore,Turkey,UCT,US/Alaska,US/Aleutian,US/Arizona,US/Central,US/East-Indiana,US/Eastern,US/Hawaii,US/Indiana-Starke,US/Michigan,US/Mountain,US/Pacific,US/Samoa,UTC,Universal,W-SU,WET,Zulu

**Example:**
```json
{ "name": "cyberchef_parse_datetime", "arguments": { "input": "..." } }
```

---

#### Translate DateTime Format (`cyberchef_translate_datetime_format`)
Parses a datetime string in one format and re-writes it in another.

Run with no input to see the relevant format string examples.

**Arguments:**
*   `built_in_formats` (populateOption): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `input_format_string` (binaryString): Default: DD/MM/YYYY HH:mm:ss
*   `input_timezone` (Enum: [UTC, Africa/Abidjan, Africa/Accra, Africa/Addis_Ababa, Africa/Algiers, ...]): Default: UTC,Africa/Abidjan,Africa/Accra,Africa/Addis_Ababa,Africa/Algiers,Africa/Asmara,Africa/Asmera,Africa/Bamako,Africa/Bangui,Africa/Banjul,Africa/Bissau,Africa/Blantyre,Africa/Brazzaville,Africa/Bujumbura,Africa/Cairo,Africa/Casablanca,Africa/Ceuta,Africa/Conakry,Africa/Dakar,Africa/Dar_es_Salaam,Africa/Djibouti,Africa/Douala,Africa/El_Aaiun,Africa/Freetown,Africa/Gaborone,Africa/Harare,Africa/Johannesburg,Africa/Juba,Africa/Kampala,Africa/Khartoum,Africa/Kigali,Africa/Kinshasa,Africa/Lagos,Africa/Libreville,Africa/Lome,Africa/Luanda,Africa/Lubumbashi,Africa/Lusaka,Africa/Malabo,Africa/Maputo,Africa/Maseru,Africa/Mbabane,Africa/Mogadishu,Africa/Monrovia,Africa/Nairobi,Africa/Ndjamena,Africa/Niamey,Africa/Nouakchott,Africa/Ouagadougou,Africa/Porto-Novo,Africa/Sao_Tome,Africa/Timbuktu,Africa/Tripoli,Africa/Tunis,Africa/Windhoek,America/Adak,America/Anchorage,America/Anguilla,America/Antigua,America/Araguaina,America/Argentina/Buenos_Aires,America/Argentina/Catamarca,America/Argentina/ComodRivadavia,America/Argentina/Cordoba,America/Argentina/Jujuy,America/Argentina/La_Rioja,America/Argentina/Mendoza,America/Argentina/Rio_Gallegos,America/Argentina/Salta,America/Argentina/San_Juan,America/Argentina/San_Luis,America/Argentina/Tucuman,America/Argentina/Ushuaia,America/Aruba,America/Asuncion,America/Atikokan,America/Atka,America/Bahia,America/Bahia_Banderas,America/Barbados,America/Belem,America/Belize,America/Blanc-Sablon,America/Boa_Vista,America/Bogota,America/Boise,America/Buenos_Aires,America/Cambridge_Bay,America/Campo_Grande,America/Cancun,America/Caracas,America/Catamarca,America/Cayenne,America/Cayman,America/Chicago,America/Chihuahua,America/Ciudad_Juarez,America/Coral_Harbour,America/Cordoba,America/Costa_Rica,America/Creston,America/Cuiaba,America/Curacao,America/Danmarkshavn,America/Dawson,America/Dawson_Creek,America/Denver,America/Detroit,America/Dominica,America/Edmonton,America/Eirunepe,America/El_Salvador,America/Ensenada,America/Fort_Nelson,America/Fort_Wayne,America/Fortaleza,America/Glace_Bay,America/Godthab,America/Goose_Bay,America/Grand_Turk,America/Grenada,America/Guadeloupe,America/Guatemala,America/Guayaquil,America/Guyana,America/Halifax,America/Havana,America/Hermosillo,America/Indiana/Indianapolis,America/Indiana/Knox,America/Indiana/Marengo,America/Indiana/Petersburg,America/Indiana/Tell_City,America/Indiana/Vevay,America/Indiana/Vincennes,America/Indiana/Winamac,America/Indianapolis,America/Inuvik,America/Iqaluit,America/Jamaica,America/Jujuy,America/Juneau,America/Kentucky/Louisville,America/Kentucky/Monticello,America/Knox_IN,America/Kralendijk,America/La_Paz,America/Lima,America/Los_Angeles,America/Louisville,America/Lower_Princes,America/Maceio,America/Managua,America/Manaus,America/Marigot,America/Martinique,America/Matamoros,America/Mazatlan,America/Mendoza,America/Menominee,America/Merida,America/Metlakatla,America/Mexico_City,America/Miquelon,America/Moncton,America/Monterrey,America/Montevideo,America/Montreal,America/Montserrat,America/Nassau,America/New_York,America/Nipigon,America/Nome,America/Noronha,America/North_Dakota/Beulah,America/North_Dakota/Center,America/North_Dakota/New_Salem,America/Nuuk,America/Ojinaga,America/Panama,America/Pangnirtung,America/Paramaribo,America/Phoenix,America/Port-au-Prince,America/Port_of_Spain,America/Porto_Acre,America/Porto_Velho,America/Puerto_Rico,America/Punta_Arenas,America/Rainy_River,America/Rankin_Inlet,America/Recife,America/Regina,America/Resolute,America/Rio_Branco,America/Rosario,America/Santa_Isabel,America/Santarem,America/Santiago,America/Santo_Domingo,America/Sao_Paulo,America/Scoresbysund,America/Shiprock,America/Sitka,America/St_Barthelemy,America/St_Johns,America/St_Kitts,America/St_Lucia,America/St_Thomas,America/St_Vincent,America/Swift_Current,America/Tegucigalpa,America/Thule,America/Thunder_Bay,America/Tijuana,America/Toronto,America/Tortola,America/Vancouver,America/Virgin,America/Whitehorse,America/Winnipeg,America/Yakutat,America/Yellowknife,Antarctica/Casey,Antarctica/Davis,Antarctica/DumontDUrville,Antarctica/Macquarie,Antarctica/Mawson,Antarctica/McMurdo,Antarctica/Palmer,Antarctica/Rothera,Antarctica/South_Pole,Antarctica/Syowa,Antarctica/Troll,Antarctica/Vostok,Arctic/Longyearbyen,Asia/Aden,Asia/Almaty,Asia/Amman,Asia/Anadyr,Asia/Aqtau,Asia/Aqtobe,Asia/Ashgabat,Asia/Ashkhabad,Asia/Atyrau,Asia/Baghdad,Asia/Bahrain,Asia/Baku,Asia/Bangkok,Asia/Barnaul,Asia/Beirut,Asia/Bishkek,Asia/Brunei,Asia/Calcutta,Asia/Chita,Asia/Choibalsan,Asia/Chongqing,Asia/Chungking,Asia/Colombo,Asia/Dacca,Asia/Damascus,Asia/Dhaka,Asia/Dili,Asia/Dubai,Asia/Dushanbe,Asia/Famagusta,Asia/Gaza,Asia/Harbin,Asia/Hebron,Asia/Ho_Chi_Minh,Asia/Hong_Kong,Asia/Hovd,Asia/Irkutsk,Asia/Istanbul,Asia/Jakarta,Asia/Jayapura,Asia/Jerusalem,Asia/Kabul,Asia/Kamchatka,Asia/Karachi,Asia/Kashgar,Asia/Kathmandu,Asia/Katmandu,Asia/Khandyga,Asia/Kolkata,Asia/Krasnoyarsk,Asia/Kuala_Lumpur,Asia/Kuching,Asia/Kuwait,Asia/Macao,Asia/Macau,Asia/Magadan,Asia/Makassar,Asia/Manila,Asia/Muscat,Asia/Nicosia,Asia/Novokuznetsk,Asia/Novosibirsk,Asia/Omsk,Asia/Oral,Asia/Phnom_Penh,Asia/Pontianak,Asia/Pyongyang,Asia/Qatar,Asia/Qostanay,Asia/Qyzylorda,Asia/Rangoon,Asia/Riyadh,Asia/Saigon,Asia/Sakhalin,Asia/Samarkand,Asia/Seoul,Asia/Shanghai,Asia/Singapore,Asia/Srednekolymsk,Asia/Taipei,Asia/Tashkent,Asia/Tbilisi,Asia/Tehran,Asia/Tel_Aviv,Asia/Thimbu,Asia/Thimphu,Asia/Tokyo,Asia/Tomsk,Asia/Ujung_Pandang,Asia/Ulaanbaatar,Asia/Ulan_Bator,Asia/Urumqi,Asia/Ust-Nera,Asia/Vientiane,Asia/Vladivostok,Asia/Yakutsk,Asia/Yangon,Asia/Yekaterinburg,Asia/Yerevan,Atlantic/Azores,Atlantic/Bermuda,Atlantic/Canary,Atlantic/Cape_Verde,Atlantic/Faeroe,Atlantic/Faroe,Atlantic/Jan_Mayen,Atlantic/Madeira,Atlantic/Reykjavik,Atlantic/South_Georgia,Atlantic/St_Helena,Atlantic/Stanley,Australia/ACT,Australia/Adelaide,Australia/Brisbane,Australia/Broken_Hill,Australia/Canberra,Australia/Currie,Australia/Darwin,Australia/Eucla,Australia/Hobart,Australia/LHI,Australia/Lindeman,Australia/Lord_Howe,Australia/Melbourne,Australia/NSW,Australia/North,Australia/Perth,Australia/Queensland,Australia/South,Australia/Sydney,Australia/Tasmania,Australia/Victoria,Australia/West,Australia/Yancowinna,Brazil/Acre,Brazil/DeNoronha,Brazil/East,Brazil/West,CET,CST6CDT,Canada/Atlantic,Canada/Central,Canada/Eastern,Canada/Mountain,Canada/Newfoundland,Canada/Pacific,Canada/Saskatchewan,Canada/Yukon,Chile/Continental,Chile/EasterIsland,Cuba,EET,EST,EST5EDT,Egypt,Eire,Etc/GMT,Etc/GMT+0,Etc/GMT+1,Etc/GMT+10,Etc/GMT+11,Etc/GMT+12,Etc/GMT+2,Etc/GMT+3,Etc/GMT+4,Etc/GMT+5,Etc/GMT+6,Etc/GMT+7,Etc/GMT+8,Etc/GMT+9,Etc/GMT-0,Etc/GMT-1,Etc/GMT-10,Etc/GMT-11,Etc/GMT-12,Etc/GMT-13,Etc/GMT-14,Etc/GMT-2,Etc/GMT-3,Etc/GMT-4,Etc/GMT-5,Etc/GMT-6,Etc/GMT-7,Etc/GMT-8,Etc/GMT-9,Etc/GMT0,Etc/Greenwich,Etc/UCT,Etc/UTC,Etc/Universal,Etc/Zulu,Europe/Amsterdam,Europe/Andorra,Europe/Astrakhan,Europe/Athens,Europe/Belfast,Europe/Belgrade,Europe/Berlin,Europe/Bratislava,Europe/Brussels,Europe/Bucharest,Europe/Budapest,Europe/Busingen,Europe/Chisinau,Europe/Copenhagen,Europe/Dublin,Europe/Gibraltar,Europe/Guernsey,Europe/Helsinki,Europe/Isle_of_Man,Europe/Istanbul,Europe/Jersey,Europe/Kaliningrad,Europe/Kiev,Europe/Kirov,Europe/Kyiv,Europe/Lisbon,Europe/Ljubljana,Europe/London,Europe/Luxembourg,Europe/Madrid,Europe/Malta,Europe/Mariehamn,Europe/Minsk,Europe/Monaco,Europe/Moscow,Europe/Nicosia,Europe/Oslo,Europe/Paris,Europe/Podgorica,Europe/Prague,Europe/Riga,Europe/Rome,Europe/Samara,Europe/San_Marino,Europe/Sarajevo,Europe/Saratov,Europe/Simferopol,Europe/Skopje,Europe/Sofia,Europe/Stockholm,Europe/Tallinn,Europe/Tirane,Europe/Tiraspol,Europe/Ulyanovsk,Europe/Uzhgorod,Europe/Vaduz,Europe/Vatican,Europe/Vienna,Europe/Vilnius,Europe/Volgograd,Europe/Warsaw,Europe/Zagreb,Europe/Zaporozhye,Europe/Zurich,GB,GB-Eire,GMT,GMT+0,GMT-0,GMT0,Greenwich,HST,Hongkong,Iceland,Indian/Antananarivo,Indian/Chagos,Indian/Christmas,Indian/Cocos,Indian/Comoro,Indian/Kerguelen,Indian/Mahe,Indian/Maldives,Indian/Mauritius,Indian/Mayotte,Indian/Reunion,Iran,Israel,Jamaica,Japan,Kwajalein,Libya,MET,MST,MST7MDT,Mexico/BajaNorte,Mexico/BajaSur,Mexico/General,NZ,NZ-CHAT,Navajo,PRC,PST8PDT,Pacific/Apia,Pacific/Auckland,Pacific/Bougainville,Pacific/Chatham,Pacific/Chuuk,Pacific/Easter,Pacific/Efate,Pacific/Enderbury,Pacific/Fakaofo,Pacific/Fiji,Pacific/Funafuti,Pacific/Galapagos,Pacific/Gambier,Pacific/Guadalcanal,Pacific/Guam,Pacific/Honolulu,Pacific/Johnston,Pacific/Kanton,Pacific/Kiritimati,Pacific/Kosrae,Pacific/Kwajalein,Pacific/Majuro,Pacific/Marquesas,Pacific/Midway,Pacific/Nauru,Pacific/Niue,Pacific/Norfolk,Pacific/Noumea,Pacific/Pago_Pago,Pacific/Palau,Pacific/Pitcairn,Pacific/Pohnpei,Pacific/Ponape,Pacific/Port_Moresby,Pacific/Rarotonga,Pacific/Saipan,Pacific/Samoa,Pacific/Tahiti,Pacific/Tarawa,Pacific/Tongatapu,Pacific/Truk,Pacific/Wake,Pacific/Wallis,Pacific/Yap,Poland,Portugal,ROC,ROK,Singapore,Turkey,UCT,US/Alaska,US/Aleutian,US/Arizona,US/Central,US/East-Indiana,US/Eastern,US/Hawaii,US/Indiana-Starke,US/Michigan,US/Mountain,US/Pacific,US/Samoa,UTC,Universal,W-SU,WET,Zulu
*   `output_format_string` (binaryString): Default: dddd Do MMMM YYYY HH:mm:ss Z z
*   `output_timezone` (Enum: [UTC, Africa/Abidjan, Africa/Accra, Africa/Addis_Ababa, Africa/Algiers, ...]): Default: UTC,Africa/Abidjan,Africa/Accra,Africa/Addis_Ababa,Africa/Algiers,Africa/Asmara,Africa/Asmera,Africa/Bamako,Africa/Bangui,Africa/Banjul,Africa/Bissau,Africa/Blantyre,Africa/Brazzaville,Africa/Bujumbura,Africa/Cairo,Africa/Casablanca,Africa/Ceuta,Africa/Conakry,Africa/Dakar,Africa/Dar_es_Salaam,Africa/Djibouti,Africa/Douala,Africa/El_Aaiun,Africa/Freetown,Africa/Gaborone,Africa/Harare,Africa/Johannesburg,Africa/Juba,Africa/Kampala,Africa/Khartoum,Africa/Kigali,Africa/Kinshasa,Africa/Lagos,Africa/Libreville,Africa/Lome,Africa/Luanda,Africa/Lubumbashi,Africa/Lusaka,Africa/Malabo,Africa/Maputo,Africa/Maseru,Africa/Mbabane,Africa/Mogadishu,Africa/Monrovia,Africa/Nairobi,Africa/Ndjamena,Africa/Niamey,Africa/Nouakchott,Africa/Ouagadougou,Africa/Porto-Novo,Africa/Sao_Tome,Africa/Timbuktu,Africa/Tripoli,Africa/Tunis,Africa/Windhoek,America/Adak,America/Anchorage,America/Anguilla,America/Antigua,America/Araguaina,America/Argentina/Buenos_Aires,America/Argentina/Catamarca,America/Argentina/ComodRivadavia,America/Argentina/Cordoba,America/Argentina/Jujuy,America/Argentina/La_Rioja,America/Argentina/Mendoza,America/Argentina/Rio_Gallegos,America/Argentina/Salta,America/Argentina/San_Juan,America/Argentina/San_Luis,America/Argentina/Tucuman,America/Argentina/Ushuaia,America/Aruba,America/Asuncion,America/Atikokan,America/Atka,America/Bahia,America/Bahia_Banderas,America/Barbados,America/Belem,America/Belize,America/Blanc-Sablon,America/Boa_Vista,America/Bogota,America/Boise,America/Buenos_Aires,America/Cambridge_Bay,America/Campo_Grande,America/Cancun,America/Caracas,America/Catamarca,America/Cayenne,America/Cayman,America/Chicago,America/Chihuahua,America/Ciudad_Juarez,America/Coral_Harbour,America/Cordoba,America/Costa_Rica,America/Creston,America/Cuiaba,America/Curacao,America/Danmarkshavn,America/Dawson,America/Dawson_Creek,America/Denver,America/Detroit,America/Dominica,America/Edmonton,America/Eirunepe,America/El_Salvador,America/Ensenada,America/Fort_Nelson,America/Fort_Wayne,America/Fortaleza,America/Glace_Bay,America/Godthab,America/Goose_Bay,America/Grand_Turk,America/Grenada,America/Guadeloupe,America/Guatemala,America/Guayaquil,America/Guyana,America/Halifax,America/Havana,America/Hermosillo,America/Indiana/Indianapolis,America/Indiana/Knox,America/Indiana/Marengo,America/Indiana/Petersburg,America/Indiana/Tell_City,America/Indiana/Vevay,America/Indiana/Vincennes,America/Indiana/Winamac,America/Indianapolis,America/Inuvik,America/Iqaluit,America/Jamaica,America/Jujuy,America/Juneau,America/Kentucky/Louisville,America/Kentucky/Monticello,America/Knox_IN,America/Kralendijk,America/La_Paz,America/Lima,America/Los_Angeles,America/Louisville,America/Lower_Princes,America/Maceio,America/Managua,America/Manaus,America/Marigot,America/Martinique,America/Matamoros,America/Mazatlan,America/Mendoza,America/Menominee,America/Merida,America/Metlakatla,America/Mexico_City,America/Miquelon,America/Moncton,America/Monterrey,America/Montevideo,America/Montreal,America/Montserrat,America/Nassau,America/New_York,America/Nipigon,America/Nome,America/Noronha,America/North_Dakota/Beulah,America/North_Dakota/Center,America/North_Dakota/New_Salem,America/Nuuk,America/Ojinaga,America/Panama,America/Pangnirtung,America/Paramaribo,America/Phoenix,America/Port-au-Prince,America/Port_of_Spain,America/Porto_Acre,America/Porto_Velho,America/Puerto_Rico,America/Punta_Arenas,America/Rainy_River,America/Rankin_Inlet,America/Recife,America/Regina,America/Resolute,America/Rio_Branco,America/Rosario,America/Santa_Isabel,America/Santarem,America/Santiago,America/Santo_Domingo,America/Sao_Paulo,America/Scoresbysund,America/Shiprock,America/Sitka,America/St_Barthelemy,America/St_Johns,America/St_Kitts,America/St_Lucia,America/St_Thomas,America/St_Vincent,America/Swift_Current,America/Tegucigalpa,America/Thule,America/Thunder_Bay,America/Tijuana,America/Toronto,America/Tortola,America/Vancouver,America/Virgin,America/Whitehorse,America/Winnipeg,America/Yakutat,America/Yellowknife,Antarctica/Casey,Antarctica/Davis,Antarctica/DumontDUrville,Antarctica/Macquarie,Antarctica/Mawson,Antarctica/McMurdo,Antarctica/Palmer,Antarctica/Rothera,Antarctica/South_Pole,Antarctica/Syowa,Antarctica/Troll,Antarctica/Vostok,Arctic/Longyearbyen,Asia/Aden,Asia/Almaty,Asia/Amman,Asia/Anadyr,Asia/Aqtau,Asia/Aqtobe,Asia/Ashgabat,Asia/Ashkhabad,Asia/Atyrau,Asia/Baghdad,Asia/Bahrain,Asia/Baku,Asia/Bangkok,Asia/Barnaul,Asia/Beirut,Asia/Bishkek,Asia/Brunei,Asia/Calcutta,Asia/Chita,Asia/Choibalsan,Asia/Chongqing,Asia/Chungking,Asia/Colombo,Asia/Dacca,Asia/Damascus,Asia/Dhaka,Asia/Dili,Asia/Dubai,Asia/Dushanbe,Asia/Famagusta,Asia/Gaza,Asia/Harbin,Asia/Hebron,Asia/Ho_Chi_Minh,Asia/Hong_Kong,Asia/Hovd,Asia/Irkutsk,Asia/Istanbul,Asia/Jakarta,Asia/Jayapura,Asia/Jerusalem,Asia/Kabul,Asia/Kamchatka,Asia/Karachi,Asia/Kashgar,Asia/Kathmandu,Asia/Katmandu,Asia/Khandyga,Asia/Kolkata,Asia/Krasnoyarsk,Asia/Kuala_Lumpur,Asia/Kuching,Asia/Kuwait,Asia/Macao,Asia/Macau,Asia/Magadan,Asia/Makassar,Asia/Manila,Asia/Muscat,Asia/Nicosia,Asia/Novokuznetsk,Asia/Novosibirsk,Asia/Omsk,Asia/Oral,Asia/Phnom_Penh,Asia/Pontianak,Asia/Pyongyang,Asia/Qatar,Asia/Qostanay,Asia/Qyzylorda,Asia/Rangoon,Asia/Riyadh,Asia/Saigon,Asia/Sakhalin,Asia/Samarkand,Asia/Seoul,Asia/Shanghai,Asia/Singapore,Asia/Srednekolymsk,Asia/Taipei,Asia/Tashkent,Asia/Tbilisi,Asia/Tehran,Asia/Tel_Aviv,Asia/Thimbu,Asia/Thimphu,Asia/Tokyo,Asia/Tomsk,Asia/Ujung_Pandang,Asia/Ulaanbaatar,Asia/Ulan_Bator,Asia/Urumqi,Asia/Ust-Nera,Asia/Vientiane,Asia/Vladivostok,Asia/Yakutsk,Asia/Yangon,Asia/Yekaterinburg,Asia/Yerevan,Atlantic/Azores,Atlantic/Bermuda,Atlantic/Canary,Atlantic/Cape_Verde,Atlantic/Faeroe,Atlantic/Faroe,Atlantic/Jan_Mayen,Atlantic/Madeira,Atlantic/Reykjavik,Atlantic/South_Georgia,Atlantic/St_Helena,Atlantic/Stanley,Australia/ACT,Australia/Adelaide,Australia/Brisbane,Australia/Broken_Hill,Australia/Canberra,Australia/Currie,Australia/Darwin,Australia/Eucla,Australia/Hobart,Australia/LHI,Australia/Lindeman,Australia/Lord_Howe,Australia/Melbourne,Australia/NSW,Australia/North,Australia/Perth,Australia/Queensland,Australia/South,Australia/Sydney,Australia/Tasmania,Australia/Victoria,Australia/West,Australia/Yancowinna,Brazil/Acre,Brazil/DeNoronha,Brazil/East,Brazil/West,CET,CST6CDT,Canada/Atlantic,Canada/Central,Canada/Eastern,Canada/Mountain,Canada/Newfoundland,Canada/Pacific,Canada/Saskatchewan,Canada/Yukon,Chile/Continental,Chile/EasterIsland,Cuba,EET,EST,EST5EDT,Egypt,Eire,Etc/GMT,Etc/GMT+0,Etc/GMT+1,Etc/GMT+10,Etc/GMT+11,Etc/GMT+12,Etc/GMT+2,Etc/GMT+3,Etc/GMT+4,Etc/GMT+5,Etc/GMT+6,Etc/GMT+7,Etc/GMT+8,Etc/GMT+9,Etc/GMT-0,Etc/GMT-1,Etc/GMT-10,Etc/GMT-11,Etc/GMT-12,Etc/GMT-13,Etc/GMT-14,Etc/GMT-2,Etc/GMT-3,Etc/GMT-4,Etc/GMT-5,Etc/GMT-6,Etc/GMT-7,Etc/GMT-8,Etc/GMT-9,Etc/GMT0,Etc/Greenwich,Etc/UCT,Etc/UTC,Etc/Universal,Etc/Zulu,Europe/Amsterdam,Europe/Andorra,Europe/Astrakhan,Europe/Athens,Europe/Belfast,Europe/Belgrade,Europe/Berlin,Europe/Bratislava,Europe/Brussels,Europe/Bucharest,Europe/Budapest,Europe/Busingen,Europe/Chisinau,Europe/Copenhagen,Europe/Dublin,Europe/Gibraltar,Europe/Guernsey,Europe/Helsinki,Europe/Isle_of_Man,Europe/Istanbul,Europe/Jersey,Europe/Kaliningrad,Europe/Kiev,Europe/Kirov,Europe/Kyiv,Europe/Lisbon,Europe/Ljubljana,Europe/London,Europe/Luxembourg,Europe/Madrid,Europe/Malta,Europe/Mariehamn,Europe/Minsk,Europe/Monaco,Europe/Moscow,Europe/Nicosia,Europe/Oslo,Europe/Paris,Europe/Podgorica,Europe/Prague,Europe/Riga,Europe/Rome,Europe/Samara,Europe/San_Marino,Europe/Sarajevo,Europe/Saratov,Europe/Simferopol,Europe/Skopje,Europe/Sofia,Europe/Stockholm,Europe/Tallinn,Europe/Tirane,Europe/Tiraspol,Europe/Ulyanovsk,Europe/Uzhgorod,Europe/Vaduz,Europe/Vatican,Europe/Vienna,Europe/Vilnius,Europe/Volgograd,Europe/Warsaw,Europe/Zagreb,Europe/Zaporozhye,Europe/Zurich,GB,GB-Eire,GMT,GMT+0,GMT-0,GMT0,Greenwich,HST,Hongkong,Iceland,Indian/Antananarivo,Indian/Chagos,Indian/Christmas,Indian/Cocos,Indian/Comoro,Indian/Kerguelen,Indian/Mahe,Indian/Maldives,Indian/Mauritius,Indian/Mayotte,Indian/Reunion,Iran,Israel,Jamaica,Japan,Kwajalein,Libya,MET,MST,MST7MDT,Mexico/BajaNorte,Mexico/BajaSur,Mexico/General,NZ,NZ-CHAT,Navajo,PRC,PST8PDT,Pacific/Apia,Pacific/Auckland,Pacific/Bougainville,Pacific/Chatham,Pacific/Chuuk,Pacific/Easter,Pacific/Efate,Pacific/Enderbury,Pacific/Fakaofo,Pacific/Fiji,Pacific/Funafuti,Pacific/Galapagos,Pacific/Gambier,Pacific/Guadalcanal,Pacific/Guam,Pacific/Honolulu,Pacific/Johnston,Pacific/Kanton,Pacific/Kiritimati,Pacific/Kosrae,Pacific/Kwajalein,Pacific/Majuro,Pacific/Marquesas,Pacific/Midway,Pacific/Nauru,Pacific/Niue,Pacific/Norfolk,Pacific/Noumea,Pacific/Pago_Pago,Pacific/Palau,Pacific/Pitcairn,Pacific/Pohnpei,Pacific/Ponape,Pacific/Port_Moresby,Pacific/Rarotonga,Pacific/Saipan,Pacific/Samoa,Pacific/Tahiti,Pacific/Tarawa,Pacific/Tongatapu,Pacific/Truk,Pacific/Wake,Pacific/Wallis,Pacific/Yap,Poland,Portugal,ROC,ROK,Singapore,Turkey,UCT,US/Alaska,US/Aleutian,US/Arizona,US/Central,US/East-Indiana,US/Eastern,US/Hawaii,US/Indiana-Starke,US/Michigan,US/Mountain,US/Pacific,US/Samoa,UTC,Universal,W-SU,WET,Zulu

**Example:**
```json
{ "name": "cyberchef_translate_datetime_format", "arguments": { "input": "..." } }
```

---

#### From UNIX Timestamp (`cyberchef_from_unix_timestamp`)
Converts a UNIX timestamp to a datetime string.

e.g. 978346800 becomes Mon 1 January 2001 11:00:00 UTC

A UNIX timestamp is a 32-bit value representing the number of seconds since January 1, 1970 UTC (the UNIX epoch).

**Arguments:**
*   `units` (Enum: [Seconds (s), Milliseconds (ms), Microseconds (μs), Nanoseconds (ns)]): Default: Seconds (s),Milliseconds (ms),Microseconds (μs),Nanoseconds (ns)

**Example:**
```json
{ "name": "cyberchef_from_unix_timestamp", "arguments": { "input": "..." } }
```

---

#### To UNIX Timestamp (`cyberchef_to_unix_timestamp`)
Parses a datetime string in UTC and returns the corresponding UNIX timestamp.

e.g. Mon 1 January 2001 11:00:00 becomes 978346800

A UNIX timestamp is a 32-bit value representing the number of seconds since January 1, 1970 UTC (the UNIX epoch).

**Arguments:**
*   `units` (Enum: [Seconds (s), Milliseconds (ms), Microseconds (μs), Nanoseconds (ns)]): Default: Seconds (s),Milliseconds (ms),Microseconds (μs),Nanoseconds (ns)
*   `treat_as_utc` (boolean): Default: true
*   `show_parsed_datetime` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_to_unix_timestamp", "arguments": { "input": "..." } }
```

---

#### Windows Filetime to UNIX Timestamp (`cyberchef_windows_filetime_to_unix_timestamp`)
Converts a Windows Filetime value to a UNIX timestamp.

A Windows Filetime is a 64-bit value representing the number of 100-nanosecond intervals since January 1, 1601 UTC.

A UNIX timestamp is a 32-bit value representing the number of seconds since January 1, 1970 UTC (the UNIX epoch).

This operation also supports UNIX timestamps in milliseconds, microseconds and nanoseconds.

**Arguments:**
*   `output_units` (Enum: [Seconds (s), Milliseconds (ms), Microseconds (μs), Nanoseconds (ns)]): Default: Seconds (s),Milliseconds (ms),Microseconds (μs),Nanoseconds (ns)
*   `input_format` (Enum: [Decimal, Hex (big endian), Hex (little endian)]): Default: Decimal,Hex (big endian),Hex (little endian)

**Example:**
```json
{ "name": "cyberchef_windows_filetime_to_unix_timestamp", "arguments": { "input": "..." } }
```

---

#### UNIX Timestamp to Windows Filetime (`cyberchef_unix_timestamp_to_windows_filetime`)
Converts a UNIX timestamp to a Windows Filetime value.

A Windows Filetime is a 64-bit value representing the number of 100-nanosecond intervals since January 1, 1601 UTC.

A UNIX timestamp is a 32-bit value representing the number of seconds since January 1, 1970 UTC (the UNIX epoch).

This operation also supports UNIX timestamps in milliseconds, microseconds and nanoseconds.

**Arguments:**
*   `input_units` (Enum: [Seconds (s), Milliseconds (ms), Microseconds (μs), Nanoseconds (ns)]): Default: Seconds (s),Milliseconds (ms),Microseconds (μs),Nanoseconds (ns)
*   `output_format` (Enum: [Decimal, Hex (big endian), Hex (little endian)]): Default: Decimal,Hex (big endian),Hex (little endian)

**Example:**
```json
{ "name": "cyberchef_unix_timestamp_to_windows_filetime", "arguments": { "input": "..." } }
```

---

#### DateTime Delta (`cyberchef_datetime_delta`)
Calculates a new DateTime value given an input DateTime value and a time difference (delta) from the input DateTime value.

**Arguments:**
*   `built_in_formats` (populateOption): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `input_format_string` (binaryString): Default: DD/MM/YYYY HH:mm:ss
*   `time_operation` (Enum: [Add, Subtract]): Default: Add,Subtract
*   `days` (number): Default: 0
*   `hours` (number): Default: 0
*   `minutes` (number): Default: 0
*   `seconds` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_datetime_delta", "arguments": { "input": "..." } }
```

---

#### Extract dates (`cyberchef_extract_dates`)
Extracts dates in the following formatsyyyy-mm-dddd/mm/yyyymm/dd/yyyyDividers can be any of /, -, . or space

**Arguments:**
*   `display_total` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_extract_dates", "arguments": { "input": "..." } }
```

---

#### Get Time (`cyberchef_get_time`)
Generates a timestamp showing the amount of time since the UNIX epoch (1970-01-01 00:00:00 UTC). Uses the W3C High Resolution Time API.

**Arguments:**
*   `granularity` (Enum: [Seconds (s), Milliseconds (ms), Microseconds (μs), Nanoseconds (ns)]): Default: Seconds (s),Milliseconds (ms),Microseconds (μs),Nanoseconds (ns)

**Example:**
```json
{ "name": "cyberchef_get_time", "arguments": { "input": "..." } }
```

---

#### Sleep (`cyberchef_sleep`)
Sleep causes the recipe to wait for a specified number of milliseconds before continuing execution.

**Arguments:**
*   `time_(ms)` (number): Default: 1000

**Example:**
```json
{ "name": "cyberchef_sleep", "arguments": { "input": "..." } }
```

---

### Extractors

#### Strings (`cyberchef_strings`)
Extracts all strings from the input.

**Arguments:**
*   `encoding` (Enum: [Single byte, 16-bit littleendian, 16-bit bigendian, All]): Default: Single byte,16-bit littleendian,16-bit bigendian,All
*   `minimum_length` (number): Default: 4
*   `match` (Enum: [[ASCII], Alphanumeric + punctuation (A), All printable chars (A), Null-terminated strings (A), [Unicode], ...]): Default: [ASCII],Alphanumeric + punctuation (A),All printable chars (A),Null-terminated strings (A),[Unicode],Alphanumeric + punctuation (U),All printable chars (U),Null-terminated strings (U)
*   `display_total` (boolean): Default: false
*   `sort` (boolean): Default: false
*   `unique` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_strings", "arguments": { "input": "..." } }
```

---

#### Extract IP addresses (`cyberchef_extract_ip_addresses`)
Extracts all IPv4 and IPv6 addresses.

Warning: Given a string 1.2.3.4.5.6.7.8, this will match 1.2.3.4 and 5.6.7.8 so always check the original input!

**Arguments:**
*   `ipv4` (boolean): Default: true
*   `ipv6` (boolean): Default: false
*   `remove_local_ipv4_addresses` (boolean): Default: false
*   `display_total` (boolean): Default: false
*   `sort` (boolean): Default: false
*   `unique` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_extract_ip_addresses", "arguments": { "input": "..." } }
```

---

#### Extract email addresses (`cyberchef_extract_email_addresses`)
Extracts all email addresses from the input.

**Arguments:**
*   `display_total` (boolean): Default: false
*   `sort` (boolean): Default: false
*   `unique` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_extract_email_addresses", "arguments": { "input": "..." } }
```

---

#### Extract MAC addresses (`cyberchef_extract_mac_addresses`)
Extracts all Media Access Control (MAC) addresses from the input.

**Arguments:**
*   `display_total` (boolean): Default: false
*   `sort` (boolean): Default: false
*   `unique` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_extract_mac_addresses", "arguments": { "input": "..." } }
```

---

#### Extract URLs (`cyberchef_extract_urls`)
Extracts Uniform Resource Locators (URLs) from the input. The protocol (http, ftp etc.) is required otherwise there will be far too many false positives.

**Arguments:**
*   `display_total` (boolean): Default: false
*   `sort` (boolean): Default: false
*   `unique` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_extract_urls", "arguments": { "input": "..." } }
```

---

#### Extract domains (`cyberchef_extract_domains`)
Extracts fully qualified domain names.
Note that this will not include paths. Use Extract URLs to find entire URLs.

**Arguments:**
*   `display_total` (boolean): Default: false
*   `sort` (boolean): Default: false
*   `unique` (boolean): Default: false
*   `underscore_(dmarc,_dkim,_etc)` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_extract_domains", "arguments": { "input": "..." } }
```

---

#### Extract file paths (`cyberchef_extract_file_paths`)
Extracts anything that looks like a Windows or UNIX file path.

Note that if UNIX is selected, there will likely be a lot of false positives.

**Arguments:**
*   `windows` (boolean): Default: true
*   `unix` (boolean): Default: true
*   `display_total` (boolean): Default: false
*   `sort` (boolean): Default: false
*   `unique` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_extract_file_paths", "arguments": { "input": "..." } }
```

---

#### Extract dates (`cyberchef_extract_dates`)
Extracts dates in the following formatsyyyy-mm-dddd/mm/yyyymm/dd/yyyyDividers can be any of /, -, . or space

**Arguments:**
*   `display_total` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_extract_dates", "arguments": { "input": "..." } }
```

---

#### Extract hashes (`cyberchef_extract_hashes`)
Extracts potential hashes based on hash character length

**Arguments:**
*   `hash_character_length` (number): Default: 40
*   `all_hashes` (boolean): Default: false
*   `display_total` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_extract_hashes", "arguments": { "input": "..." } }
```

---

#### Regular expression (`cyberchef_regular_expression`)
Define your own regular expression (regex) to search the input data with, optionally choosing from a list of pre-defined patterns.

Supports extended regex syntax including the 'dot matches all' flag, named capture groups, full unicode coverage (including \p{} categories and scripts as well as astral codes) and recursive matching.

**Arguments:**
*   `built_in_regexes` (populateOption): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `regex` (text): Default: ""
*   `case_insensitive` (boolean): Default: true
*   `^_and_$_match_at_newlines` (boolean): Default: true
*   `dot_matches_all` (boolean): Default: false
*   `unicode_support` (boolean): Default: false
*   `astral_support` (boolean): Default: false
*   `display_total` (boolean): Default: false
*   `output_format` (Enum: [Highlight matches, List matches, List capture groups, List matches with capture groups]): Default: Highlight matches,List matches,List capture groups,List matches with capture groups

**Example:**
```json
{ "name": "cyberchef_regular_expression", "arguments": { "input": "..." } }
```

---

#### XPath expression (`cyberchef_xpath_expression`)
Extract information from an XML document with an XPath query

**Arguments:**
*   `xpath` (string): Default: ""
*   `result_delimiter` (binaryShortString): Default: \n

**Example:**
```json
{ "name": "cyberchef_xpath_expression", "arguments": { "input": "..." } }
```

---

#### JPath expression (`cyberchef_jpath_expression`)
Extract information from a JSON object with a JPath query.

**Arguments:**
*   `query` (string): Default: ""
*   `result_delimiter` (binaryShortString): Default: \n

**Example:**
```json
{ "name": "cyberchef_jpath_expression", "arguments": { "input": "..." } }
```

---

#### Jsonata Query (`cyberchef_jsonata_query`)
Query and transform JSON data with a jsonata query.

**Arguments:**
*   `query` (text): Default: string

**Example:**
```json
{ "name": "cyberchef_jsonata_query", "arguments": { "input": "..." } }
```

---

#### CSS selector (`cyberchef_css_selector`)
Extract information from an HTML document with a CSS selector

**Arguments:**
*   `css_selector` (string): Default: ""
*   `delimiter` (binaryShortString): Default: \n

**Example:**
```json
{ "name": "cyberchef_css_selector", "arguments": { "input": "..." } }
```

---

#### Extract EXIF (`cyberchef_extract_exif`)
Extracts EXIF data from an image.



EXIF data is metadata embedded in images (JPEG, JPG, TIFF) and audio files.



EXIF data from photos usually contains information about the image file itself as well as the device used to create it.

**Example:**
```json
{ "name": "cyberchef_extract_exif", "arguments": { "input": "..." } }
```

---

#### Extract ID3 (`cyberchef_extract_id3`)
This operation extracts ID3 metadata from an MP3 file.

ID3 is a metadata container most often used in conjunction with the MP3 audio file format. It allows information such as the title, artist, album, track number, and other information about the file to be stored in the file itself.

**Example:**
```json
{ "name": "cyberchef_extract_id3", "arguments": { "input": "..." } }
```

---

#### Extract Files (`cyberchef_extract_files`)
Performs file carving to attempt to extract files from the input.

This operation is currently capable of carving out the following formats:
            
                
                JPG,JPEG,JPE,THM,MPOGIFPNGWEBPBMPICOTGAFLVWAVMP3PDFRTFDOCX,XLSX,PPTXEPUBEXE,DLL,DRV,VXD,SYS,OCX,VBX,COM,FON,SCRELF,BIN,AXF,O,PRX,SODYLIBZIPTARGZBZ2ZLIBXZJARLZOP,LZODEBSQLITEEVTEVTXDMPPFPLISTKEYCHAINLNK
                
            Minimum File Size can be used to prune small false positives.

**Arguments:**
*   `images` (boolean): Default: true
*   `video` (boolean): Default: true
*   `audio` (boolean): Default: true
*   `documents` (boolean): Default: true
*   `applications` (boolean): Default: true
*   `archives` (boolean): Default: true
*   `miscellaneous` (boolean): Default: false
*   `ignore_failed_extractions` (boolean): Default: true
*   `minimum_file_size` (number): Default: 100

**Example:**
```json
{ "name": "cyberchef_extract_files", "arguments": { "input": "..." } }
```

---

#### RAKE (`cyberchef_rake`)
Rapid Keyword Extraction (RAKE)



RAKE is a domain-independent keyword extraction algorithm in Natural Language Processing.



The list of stop words are from the NLTK python package

**Arguments:**
*   `word_delimiter_(regex)` (text): Default: \s
*   `sentence_delimiter_(regex)` (text): Default: \.\s|\n
*   `stop_words` (text): Default: i,me,my,myself,we,our,ours,ourselves,you,you're,you've,you'll,you'd,your,yours,yourself,yourselves,he,him,his,himself,she,she's,her,hers,herself,it,it's,its,itsef,they,them,their,theirs,themselves,what,which,who,whom,this,that,that'll,these,those,am,is,are,was,were,be,been,being,have,has,had,having,do,does',did,doing,a,an,the,and,but,if,or,because,as,until,while,of,at,by,for,with,about,against,between,into,through,during,before,after,above,below,to,from,up,down,in,out,on,off,over,under,again,further,then,once,here,there,when,where,why,how,all,any,both,each,few,more,most,other,some,such,no,nor,not,only,own,same,so,than,too,very,s,t,can,will,just,don,don't,should,should've,now,d,ll,m,o,re,ve,y,ain,aren,aren't,couldn,couldn't,didn,didn't,doesn,doesn't,hadn,hadn't,hasn,hasn't,haven,haven't,isn,isn't,ma,mightn,mightn't,mustn,mustn't,needn,needn't,shan,shan't,shouldn,shouldn't,wasn,wasn't,weren,weren't,won,won't,wouldn,wouldn't

**Example:**
```json
{ "name": "cyberchef_rake", "arguments": { "input": "..." } }
```

---

#### Template (`cyberchef_template`)
Render a template with Handlebars/Mustache substituting variables using JSON input. Templates will be rendered to plain-text only, to prevent XSS.

**Arguments:**
*   `template_definition_(.handlebars)` (text): Default: ""

**Example:**
```json
{ "name": "cyberchef_template", "arguments": { "input": "..." } }
```

---

### Compression

#### Raw Deflate (`cyberchef_raw_deflate`)
Compresses data using the deflate algorithm with no headers.

**Arguments:**
*   `compression_type` (Enum: [Dynamic Huffman Coding, Fixed Huffman Coding, None (Store)]): Default: Dynamic Huffman Coding,Fixed Huffman Coding,None (Store)

**Example:**
```json
{ "name": "cyberchef_raw_deflate", "arguments": { "input": "..." } }
```

---

#### Raw Inflate (`cyberchef_raw_inflate`)
Decompresses data which has been compressed using the deflate algorithm with no headers.

**Arguments:**
*   `start_index` (number): Default: 0
*   `initial_output_buffer_size` (number): Default: 0
*   `buffer_expansion_type` (Enum: [Adaptive, Block]): Default: Adaptive,Block
*   `resize_buffer_after_decompression` (boolean): Default: false
*   `verify_result` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_raw_inflate", "arguments": { "input": "..." } }
```

---

#### Zlib Deflate (`cyberchef_zlib_deflate`)
Compresses data using the deflate algorithm adding zlib headers.

**Arguments:**
*   `compression_type` (Enum: [Dynamic Huffman Coding, Fixed Huffman Coding, None (Store)]): Default: Dynamic Huffman Coding,Fixed Huffman Coding,None (Store)

**Example:**
```json
{ "name": "cyberchef_zlib_deflate", "arguments": { "input": "..." } }
```

---

#### Zlib Inflate (`cyberchef_zlib_inflate`)
Decompresses data which has been compressed using the deflate algorithm with zlib headers.

**Arguments:**
*   `start_index` (number): Default: 0
*   `initial_output_buffer_size` (number): Default: 0
*   `buffer_expansion_type` (Enum: [Adaptive, Block]): Default: Adaptive,Block
*   `resize_buffer_after_decompression` (boolean): Default: false
*   `verify_result` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_zlib_inflate", "arguments": { "input": "..." } }
```

---

#### Gzip (`cyberchef_gzip`)
Compresses data using the deflate algorithm with gzip headers.

**Arguments:**
*   `compression_type` (Enum: [Dynamic Huffman Coding, Fixed Huffman Coding, None (Store)]): Default: Dynamic Huffman Coding,Fixed Huffman Coding,None (Store)
*   `filename_(optional)` (string): Default: ""
*   `comment_(optional)` (string): Default: ""
*   `include_file_checksum` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_gzip", "arguments": { "input": "..." } }
```

---

#### Gunzip (`cyberchef_gunzip`)
Decompresses data which has been compressed using the deflate algorithm with gzip headers.

**Example:**
```json
{ "name": "cyberchef_gunzip", "arguments": { "input": "..." } }
```

---

#### Zip (`cyberchef_zip`)
Compresses data using the PKZIP algorithm with the given filename.

No support for multiple files at this time.

**Arguments:**
*   `filename` (string): Default: file.txt
*   `comment` (string): Default: ""
*   `password` (binaryString): Default: ""
*   `compression_method` (Enum: [Deflate, None (Store)]): Default: Deflate,None (Store)
*   `operating_system` (Enum: [MSDOS, Unix, Macintosh]): Default: MSDOS,Unix,Macintosh
*   `compression_type` (Enum: [Dynamic Huffman Coding, Fixed Huffman Coding, None (Store)]): Default: Dynamic Huffman Coding,Fixed Huffman Coding,None (Store)

**Example:**
```json
{ "name": "cyberchef_zip", "arguments": { "input": "..." } }
```

---

#### Unzip (`cyberchef_unzip`)
Decompresses data using the PKZIP algorithm and displays it per file, with support for passwords.

**Arguments:**
*   `password` (binaryString): Default: ""
*   `verify_result` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_unzip", "arguments": { "input": "..." } }
```

---

#### Bzip2 Decompress (`cyberchef_bzip2_decompress`)
Decompresses data using the Bzip2 algorithm.

**Arguments:**
*   `use_low-memory,_slower_decompression_algorithm` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_bzip2_decompress", "arguments": { "input": "..." } }
```

---

#### Bzip2 Compress (`cyberchef_bzip2_compress`)
Bzip2 is a compression library developed by Julian Seward (of GHC fame) that uses the Burrows-Wheeler algorithm. It only supports compressing single files and its compression is slow, however is more effective than Deflate (.gz & .zip).

**Arguments:**
*   `block_size_(100s_of_kb)` (number): Default: 9
*   `work_factor` (number): Default: 30

**Example:**
```json
{ "name": "cyberchef_bzip2_compress", "arguments": { "input": "..." } }
```

---

#### Tar (`cyberchef_tar`)
Packs the input into a tarball.

No support for multiple files at this time.

**Arguments:**
*   `filename` (string): Default: file.txt

**Example:**
```json
{ "name": "cyberchef_tar", "arguments": { "input": "..." } }
```

---

#### Untar (`cyberchef_untar`)
Unpacks a tarball and displays it per file.

**Example:**
```json
{ "name": "cyberchef_untar", "arguments": { "input": "..." } }
```

---

#### LZString Decompress (`cyberchef_lzstring_decompress`)
Decompresses data that was compressed with lz-string.

**Arguments:**
*   `compression_format` (Enum: [default, UTF16, Base64]): Default: default,UTF16,Base64

**Example:**
```json
{ "name": "cyberchef_lzstring_decompress", "arguments": { "input": "..." } }
```

---

#### LZString Compress (`cyberchef_lzstring_compress`)
Compress the input with lz-string.

**Arguments:**
*   `compression_format` (Enum: [default, UTF16, Base64]): Default: default,UTF16,Base64

**Example:**
```json
{ "name": "cyberchef_lzstring_compress", "arguments": { "input": "..." } }
```

---

#### LZMA Decompress (`cyberchef_lzma_decompress`)
Decompresses data using the Lempel-Ziv-Markov chain Algorithm.

**Example:**
```json
{ "name": "cyberchef_lzma_decompress", "arguments": { "input": "..." } }
```

---

#### LZMA Compress (`cyberchef_lzma_compress`)
Compresses data using the Lempel–Ziv–Markov chain algorithm. Compression mode determines the speed and effectiveness of the compression: 1 is fastest and less effective, 9 is slowest and most effective

**Arguments:**
*   `compression_mode` (Enum: [1, 2, 3, 4, 5, ...]): Default: 1,2,3,4,5,6,7,8,9

**Example:**
```json
{ "name": "cyberchef_lzma_compress", "arguments": { "input": "..." } }
```

---

#### LZ4 Decompress (`cyberchef_lz4_decompress`)
LZ4 is a lossless data compression algorithm that is focused on compression and decompression speed. It belongs to the LZ77 family of byte-oriented compression schemes.

**Example:**
```json
{ "name": "cyberchef_lz4_decompress", "arguments": { "input": "..." } }
```

---

#### LZ4 Compress (`cyberchef_lz4_compress`)
LZ4 is a lossless data compression algorithm that is focused on compression and decompression speed. It belongs to the LZ77 family of byte-oriented compression schemes.

**Example:**
```json
{ "name": "cyberchef_lz4_compress", "arguments": { "input": "..." } }
```

---

#### LZNT1 Decompress (`cyberchef_lznt1_decompress`)
Decompresses data using the LZNT1 algorithm.

Similar to the Windows API RtlDecompressBuffer.

**Example:**
```json
{ "name": "cyberchef_lznt1_decompress", "arguments": { "input": "..." } }
```

---

### Hashing

#### Analyse hash (`cyberchef_analyse_hash`)
Tries to determine information about a given hash and suggests which algorithm may have been used to generate it based on its length.

**Example:**
```json
{ "name": "cyberchef_analyse_hash", "arguments": { "input": "..." } }
```

---

#### Generate all checksums (`cyberchef_generate_all_checksums`)
Generates all available checksums for the input.

**Arguments:**
*   `length_(bits)` (Enum: [All, 3, 4, 5, 6, ...]): Default: All,3,4,5,6,7,8,10,11,12,13,14,15,16,17,21,24,30,31,32,40,64,82
*   `include_names` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_generate_all_checksums", "arguments": { "input": "..." } }
```

---

#### Generate all hashes (`cyberchef_generate_all_hashes`)
Generates all available hashes and checksums for the input.

**Arguments:**
*   `length_(bits)` (Enum: [All, 128, 160, 224, 256, ...]): Default: All,128,160,224,256,320,384,512
*   `include_names` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_generate_all_hashes", "arguments": { "input": "..." } }
```

---

#### MD2 (`cyberchef_md2`)
The MD2 (Message-Digest 2) algorithm is a cryptographic hash function developed by Ronald Rivest in 1989. The algorithm is optimized for 8-bit computers.

Although MD2 is no longer considered secure, even as of 2014, it remains in use in public key infrastructures as part of certificates generated with MD2 and RSA. The message digest algorithm consists, by default, of 18 rounds.

**Arguments:**
*   `rounds` (number): Default: 18

**Example:**
```json
{ "name": "cyberchef_md2", "arguments": { "input": "..." } }
```

---

#### MD4 (`cyberchef_md4`)
The MD4 (Message-Digest 4) algorithm is a cryptographic hash function developed by Ronald Rivest in 1990. The digest length is 128 bits. The algorithm has influenced later designs, such as the MD5, SHA-1 and RIPEMD algorithms.

The security of MD4 has been severely compromised.

**Example:**
```json
{ "name": "cyberchef_md4", "arguments": { "input": "..." } }
```

---

#### MD5 (`cyberchef_md5`)
MD5 (Message-Digest 5) is a widely used hash function. It has been used in a variety of security applications and is also commonly used to check the integrity of files.

However, MD5 is not collision resistant and it isn't suitable for applications like SSL/TLS certificates or digital signatures that rely on this property.

**Example:**
```json
{ "name": "cyberchef_md5", "arguments": { "input": "..." } }
```

---

#### MD6 (`cyberchef_md6`)
The MD6 (Message-Digest 6) algorithm is a cryptographic hash function. It uses a Merkle tree-like structure to allow for immense parallel computation of hashes for very long inputs.

**Arguments:**
*   `size` (number): Default: 256
*   `levels` (number): Default: 64
*   `key` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_md6", "arguments": { "input": "..." } }
```

---

#### SHA0 (`cyberchef_sha0`)
SHA-0 is a retronym applied to the original version of the 160-bit hash function published in 1993 under the name 'SHA'. It was withdrawn shortly after publication due to an undisclosed 'significant flaw' and replaced by the slightly revised version SHA-1. The message digest algorithm consists, by default, of 80 rounds.

**Arguments:**
*   `rounds` (number): Default: 80

**Example:**
```json
{ "name": "cyberchef_sha0", "arguments": { "input": "..." } }
```

---

#### SHA1 (`cyberchef_sha1`)
The SHA (Secure Hash Algorithm) hash functions were designed by the NSA. SHA-1 is the most established of the existing SHA hash functions and it is used in a variety of security applications and protocols.

However, SHA-1's collision resistance has been weakening as new attacks are discovered or improved. The message digest algorithm consists, by default, of 80 rounds.

**Arguments:**
*   `rounds` (number): Default: 80

**Example:**
```json
{ "name": "cyberchef_sha1", "arguments": { "input": "..." } }
```

---

#### SHA2 (`cyberchef_sha2`)
The SHA-2 (Secure Hash Algorithm 2) hash functions were designed by the NSA. SHA-2 includes significant changes from its predecessor, SHA-1. The SHA-2 family consists of hash functions with digests (hash values) that are 224, 256, 384 or 512 bits: SHA224, SHA256, SHA384, SHA512.

SHA-512 operates on 64-bit words.SHA-256 operates on 32-bit words.SHA-384 is largely identical to SHA-512 but is truncated to 384 bytes.SHA-224 is largely identical to SHA-256 but is truncated to 224 bytes.SHA-512/224 and SHA-512/256 are truncated versions of SHA-512, but the initial values are generated using the method described in Federal Information Processing Standards (FIPS) PUB 180-4. The message digest algorithm for SHA256 variants consists, by default, of 64 rounds, and for SHA512 variants, it is, by default, 160.

**Arguments:**
*   `size` (argSelector): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `rounds` (number): Default: 64
*   `rounds` (number): Default: 160

**Example:**
```json
{ "name": "cyberchef_sha2", "arguments": { "input": "..." } }
```

---

#### SHA3 (`cyberchef_sha3`)
The SHA-3 (Secure Hash Algorithm 3) hash functions were released by NIST on August 5, 2015. Although part of the same series of standards, SHA-3 is internally quite different from the MD5-like structure of SHA-1 and SHA-2.

SHA-3 is a subset of the broader cryptographic primitive family Keccak designed by Guido Bertoni, Joan Daemen, Michaël Peeters, and Gilles Van Assche, building upon RadioGatún.

**Arguments:**
*   `size` (Enum: [512, 384, 256, 224]): Default: 512,384,256,224

**Example:**
```json
{ "name": "cyberchef_sha3", "arguments": { "input": "..." } }
```

---

#### SM3 (`cyberchef_sm3`)
SM3 is a cryptographic hash function used in the Chinese National Standard. SM3 is mainly used in digital signatures, message authentication codes, and pseudorandom number generators. The message digest algorithm consists, by default, of 64 rounds and length of 256.

**Arguments:**
*   `length` (number): Default: 256
*   `rounds` (number): Default: 64

**Example:**
```json
{ "name": "cyberchef_sm3", "arguments": { "input": "..." } }
```

---

#### Keccak (`cyberchef_keccak`)
The Keccak hash algorithm was designed by Guido Bertoni, Joan Daemen, Michaël Peeters, and Gilles Van Assche, building upon RadioGatún. It was selected as the winner of the SHA-3 design competition.

This version of the algorithm is Keccak[c=2d] and differs from the SHA-3 specification.

**Arguments:**
*   `size` (Enum: [512, 384, 256, 224]): Default: 512,384,256,224

**Example:**
```json
{ "name": "cyberchef_keccak", "arguments": { "input": "..." } }
```

---

#### Shake (`cyberchef_shake`)
Shake is an Extendable Output Function (XOF) of the SHA-3 hash algorithm, part of the Keccak family, allowing for variable output length/size.

**Arguments:**
*   `capacity` (Enum: [256, 128]): Default: 256,128
*   `size` (number): Default: 512

**Example:**
```json
{ "name": "cyberchef_shake", "arguments": { "input": "..." } }
```

---

#### RIPEMD (`cyberchef_ripemd`)
RIPEMD (RACE Integrity Primitives Evaluation Message Digest) is a family of cryptographic hash functions developed in Leuven, Belgium, by Hans Dobbertin, Antoon Bosselaers and Bart Preneel at the COSIC research group at the Katholieke Universiteit Leuven, and first published in 1996.

RIPEMD was based upon the design principles used in MD4, and is similar in performance to the more popular SHA-1.



**Arguments:**
*   `size` (Enum: [320, 256, 160, 128]): Default: 320,256,160,128

**Example:**
```json
{ "name": "cyberchef_ripemd", "arguments": { "input": "..." } }
```

---

#### HAS-160 (`cyberchef_has_160`)
HAS-160 is a cryptographic hash function designed for use with the Korean KCDSA digital signature algorithm. It is derived from SHA-1, with assorted changes intended to increase its security. It produces a 160-bit output.

HAS-160 is used in the same way as SHA-1. First it divides input in blocks of 512 bits each and pads the final block. A digest function updates the intermediate hash value by processing the input blocks in turn.

The message digest algorithm consists, by default, of 80 rounds.

**Arguments:**
*   `rounds` (number): Default: 80

**Example:**
```json
{ "name": "cyberchef_has_160", "arguments": { "input": "..." } }
```

---

#### Whirlpool (`cyberchef_whirlpool`)
Whirlpool is a cryptographic hash function designed by Vincent Rijmen (co-creator of AES) and Paulo S. L. M. Barreto, who first described it in 2000.

Several variants exist:Whirlpool-0 is the original version released in 2000.Whirlpool-T is the first revision, released in 2001, improving the generation of the s-box.Whirlpool is the latest revision, released in 2003, fixing a flaw in the diffusion matrix.

**Arguments:**
*   `variant` (Enum: [Whirlpool, Whirlpool-T, Whirlpool-0]): Default: Whirlpool,Whirlpool-T,Whirlpool-0
*   `rounds` (number): Default: 10

**Example:**
```json
{ "name": "cyberchef_whirlpool", "arguments": { "input": "..." } }
```

---

#### Snefru (`cyberchef_snefru`)
Snefru is a cryptographic hash function invented by Ralph Merkle in 1990 while working at Xerox PARC. The function supports 128-bit and 256-bit output. It was named after the Egyptian Pharaoh Sneferu, continuing the tradition of the Khufu and Khafre block ciphers.

The original design of Snefru was shown to be insecure by Eli Biham and Adi Shamir who were able to use differential cryptanalysis to find hash collisions. The design was then modified by increasing the number of iterations of the main pass of the algorithm from two to eight.

**Arguments:**
*   `size` (number): Default: 128
*   `rounds` (Enum: [8, 4, 2]): Default: 8,4,2

**Example:**
```json
{ "name": "cyberchef_snefru", "arguments": { "input": "..." } }
```

---

#### BLAKE2b (`cyberchef_blake2b`)
Performs BLAKE2b hashing on the input.  
        

 BLAKE2b is a flavour of the BLAKE cryptographic hash function that is optimized for 64-bit platforms and produces digests of any size between 1 and 64 bytes.
        

 Supports the use of an optional key.

**Arguments:**
*   `size` (Enum: [512, 384, 256, 160, 128]): Default: 512,384,256,160,128
*   `output_encoding` (Enum: [Hex, Base64, Raw]): Default: Hex,Base64,Raw
*   `key` (toggleString): Default: ""

**Example:**
```json
{ "name": "cyberchef_blake2b", "arguments": { "input": "..." } }
```

---

#### BLAKE2s (`cyberchef_blake2s`)
Performs BLAKE2s hashing on the input.  
        

BLAKE2s is a flavour of the BLAKE cryptographic hash function that is optimized for 8- to 32-bit platforms and produces digests of any size between 1 and 32 bytes.
        

Supports the use of an optional key.

**Arguments:**
*   `size` (Enum: [256, 160, 128]): Default: 256,160,128
*   `output_encoding` (Enum: [Hex, Base64, Raw]): Default: Hex,Base64,Raw
*   `key` (toggleString): Default: ""

**Example:**
```json
{ "name": "cyberchef_blake2s", "arguments": { "input": "..." } }
```

---

#### BLAKE3 (`cyberchef_blake3`)
Hashes the input using BLAKE3 (UTF-8 encoded), with an optional key (also UTF-8), and outputs the result in hexadecimal format.

**Arguments:**
*   `size_(bytes)` (number): Default: undefined
*   `key` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_blake3", "arguments": { "input": "..." } }
```

---

#### GOST Hash (`cyberchef_gost_hash`)
The GOST hash function, defined in the standards GOST R 34.11-94 and GOST 34.311-95 is a 256-bit cryptographic hash function. It was initially defined in the Russian national standard GOST R 34.11-94 Information Technology – Cryptographic Information Security – Hash Function. The equivalent standard used by other member-states of the CIS is GOST 34.311-95.

This function must not be confused with a different Streebog hash function, which is defined in the new revision of the standard GOST R 34.11-2012.

The GOST hash function is based on the GOST block cipher.

**Arguments:**
*   `algorithm` (argSelector): Default: [object Object],[object Object]
*   `digest_length` (Enum: [256, 512]): Default: 256,512
*   `sbox` (Enum: [E-TEST, E-A, E-B, E-C, E-D, ...]): Default: E-TEST,E-A,E-B,E-C,E-D,E-SC,E-Z,D-TEST,D-A,D-SC

**Example:**
```json
{ "name": "cyberchef_gost_hash", "arguments": { "input": "..." } }
```

---

#### Streebog (`cyberchef_streebog`)
Streebog is a cryptographic hash function defined in the Russian national standard GOST R 34.11-2012 Information Technology – Cryptographic Information Security – Hash Function. It was created to replace an obsolete GOST hash function defined in the old standard GOST R 34.11-94, and as an asymmetric reply to SHA-3 competition by the US National Institute of Standards and Technology.

**Arguments:**
*   `digest_length` (Enum: [256, 512]): Default: 256,512

**Example:**
```json
{ "name": "cyberchef_streebog", "arguments": { "input": "..." } }
```

---

#### SSDEEP (`cyberchef_ssdeep`)
SSDEEP is a program for computing context triggered piecewise hashes (CTPH). Also called fuzzy hashes, CTPH can match inputs that have homologies. Such inputs have sequences of identical bytes in the same order, although bytes in between these sequences may be different in both content and length.

SSDEEP hashes are now widely used for simple identification purposes (e.g. the 'Basic Properties' section in VirusTotal). Although 'better' fuzzy hashes are available, SSDEEP is still one of the primary choices because of its speed and being a de facto standard.

This operation is fundamentally the same as the CTPH operation, however their outputs differ in format.

**Example:**
```json
{ "name": "cyberchef_ssdeep", "arguments": { "input": "..." } }
```

---

#### CTPH (`cyberchef_ctph`)
Context Triggered Piecewise Hashing, also called Fuzzy Hashing, can match inputs that have homologies. Such inputs have sequences of identical bytes in the same order, although bytes in between these sequences may be different in both content and length.

CTPH was originally based on the work of Dr. Andrew Tridgell and a spam email detector called SpamSum. This method was adapted by Jesse Kornblum and published at the DFRWS conference in 2006 in a paper 'Identifying Almost Identical Files Using Context Triggered Piecewise Hashing'.

**Example:**
```json
{ "name": "cyberchef_ctph", "arguments": { "input": "..." } }
```

---

#### Compare SSDEEP hashes (`cyberchef_compare_ssdeep_hashes`)
Compares two SSDEEP fuzzy hashes to determine the similarity between them on a scale of 0 to 100.

**Arguments:**
*   `delimiter` (Enum: [Line feed, CRLF, Space, Comma]): Default: Line feed,CRLF,Space,Comma

**Example:**
```json
{ "name": "cyberchef_compare_ssdeep_hashes", "arguments": { "input": "..." } }
```

---

#### Compare CTPH hashes (`cyberchef_compare_ctph_hashes`)
Compares two Context Triggered Piecewise Hashing (CTPH) fuzzy hashes to determine the similarity between them on a scale of 0 to 100.

**Arguments:**
*   `delimiter` (Enum: [Line feed, CRLF, Space, Comma]): Default: Line feed,CRLF,Space,Comma

**Example:**
```json
{ "name": "cyberchef_compare_ctph_hashes", "arguments": { "input": "..." } }
```

---

#### HMAC (`cyberchef_hmac`)
Keyed-Hash Message Authentication Codes (HMAC) are a mechanism for message authentication using cryptographic hash functions.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `hashing_function` (Enum: [MD2, MD4, MD5, SHA0, SHA1, ...]): Default: MD2,MD4,MD5,SHA0,SHA1,SHA224,SHA256,SHA384,SHA512,SHA512/224,SHA512/256,RIPEMD128,RIPEMD160,RIPEMD256,RIPEMD320,HAS160,Whirlpool,Whirlpool-0,Whirlpool-T,Snefru

**Example:**
```json
{ "name": "cyberchef_hmac", "arguments": { "input": "..." } }
```

---

#### CMAC (`cyberchef_cmac`)
CMAC is a block-cipher based message authentication code algorithm.

RFC4493 defines AES-CMAC that uses AES encryption with a 128-bit key.
NIST SP 800-38B suggests usages of AES with other key lengths and Triple DES.

**Arguments:**
*   `key` (toggleString): Default: ""
*   `encryption_algorithm` (Enum: [AES, Triple DES]): Default: AES,Triple DES

**Example:**
```json
{ "name": "cyberchef_cmac", "arguments": { "input": "..." } }
```

---

#### Bcrypt (`cyberchef_bcrypt`)
bcrypt is a password hashing function designed by Niels Provos and David Mazières, based on the Blowfish cipher, and presented at USENIX in 1999. Besides incorporating a salt to protect against rainbow table attacks, bcrypt is an adaptive function: over time, the iteration count (rounds) can be increased to make it slower, so it remains resistant to brute-force search attacks even with increasing computation power.

Enter the password in the input to generate its hash.

**Arguments:**
*   `rounds` (number): Default: 10

**Example:**
```json
{ "name": "cyberchef_bcrypt", "arguments": { "input": "..." } }
```

---

#### Bcrypt compare (`cyberchef_bcrypt_compare`)
Tests whether the input matches the given bcrypt hash. To test multiple possible passwords, use the 'Fork' operation.

**Arguments:**
*   `hash` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_bcrypt_compare", "arguments": { "input": "..." } }
```

---

#### Bcrypt parse (`cyberchef_bcrypt_parse`)
Parses a bcrypt hash to determine the number of rounds used, the salt, and the password hash.

**Example:**
```json
{ "name": "cyberchef_bcrypt_parse", "arguments": { "input": "..." } }
```

---

#### Argon2 (`cyberchef_argon2`)
Argon2 is a key derivation function that was selected as the winner of the Password Hashing Competition in July 2015. It was designed by Alex Biryukov, Daniel Dinu, and Dmitry Khovratovich from the University of Luxembourg.

Enter the password in the input to generate its hash.

**Arguments:**
*   `salt` (toggleString): Default: somesalt
*   `iterations` (number): Default: 3
*   `memory_(kib)` (number): Default: 4096
*   `parallelism` (number): Default: 1
*   `hash_length_(bytes)` (number): Default: 32
*   `type` (Enum: [Argon2i, Argon2d, Argon2id]): Default: Argon2i,Argon2d,Argon2id
*   `output_format` (Enum: [Encoded hash, Hex hash, Raw hash]): Default: Encoded hash,Hex hash,Raw hash

**Example:**
```json
{ "name": "cyberchef_argon2", "arguments": { "input": "..." } }
```

---

#### Argon2 compare (`cyberchef_argon2_compare`)
Tests whether the input matches the given Argon2 hash. To test multiple possible passwords, use the 'Fork' operation.

**Arguments:**
*   `encoded_hash` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_argon2_compare", "arguments": { "input": "..." } }
```

---

#### Scrypt (`cyberchef_scrypt`)
scrypt is a password-based key derivation function (PBKDF) created by Colin Percival. The algorithm was specifically designed to make it costly to perform large-scale custom hardware attacks by requiring large amounts of memory. In 2016, the scrypt algorithm was published by IETF as RFC 7914.

Enter the password in the input to generate its hash.

**Arguments:**
*   `salt` (toggleString): Default: ""
*   `iterations_(n)` (number): Default: 16384
*   `memory_factor_(r)` (number): Default: 8
*   `parallelization_factor_(p)` (number): Default: 1
*   `key_length` (number): Default: 64

**Example:**
```json
{ "name": "cyberchef_scrypt", "arguments": { "input": "..." } }
```

---

#### NT Hash (`cyberchef_nt_hash`)
An NT Hash, sometimes referred to as an NTLM hash, is a method of storing passwords on Windows systems. It works by running MD4 on UTF-16LE encoded input. NTLM hashes are considered weak because they can be brute-forced very easily with modern hardware.

**Example:**
```json
{ "name": "cyberchef_nt_hash", "arguments": { "input": "..." } }
```

---

#### LM Hash (`cyberchef_lm_hash`)
An LM Hash, or LAN Manager Hash, is a deprecated way of storing passwords on old Microsoft operating systems. It is particularly weak and can be cracked in seconds on modern hardware using rainbow tables.

**Example:**
```json
{ "name": "cyberchef_lm_hash", "arguments": { "input": "..." } }
```

---

#### MurmurHash3 (`cyberchef_murmurhash3`)
Generates a MurmurHash v3 for a string input and an optional seed input

**Arguments:**
*   `seed` (number): Default: 0
*   `convert_to_signed` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_murmurhash3", "arguments": { "input": "..." } }
```

---

#### Fletcher-8 Checksum (`cyberchef_fletcher_8_checksum`)
The Fletcher checksum is an algorithm for computing a position-dependent checksum devised by John Gould Fletcher at Lawrence Livermore Labs in the late 1970s.

The objective of the Fletcher checksum was to provide error-detection properties approaching those of a cyclic redundancy check but with the lower computational effort associated with summation techniques.

**Example:**
```json
{ "name": "cyberchef_fletcher_8_checksum", "arguments": { "input": "..." } }
```

---

#### Fletcher-16 Checksum (`cyberchef_fletcher_16_checksum`)
The Fletcher checksum is an algorithm for computing a position-dependent checksum devised by John Gould Fletcher at Lawrence Livermore Labs in the late 1970s.

The objective of the Fletcher checksum was to provide error-detection properties approaching those of a cyclic redundancy check but with the lower computational effort associated with summation techniques.

**Example:**
```json
{ "name": "cyberchef_fletcher_16_checksum", "arguments": { "input": "..." } }
```

---

#### Fletcher-32 Checksum (`cyberchef_fletcher_32_checksum`)
The Fletcher checksum is an algorithm for computing a position-dependent checksum devised by John Gould Fletcher at Lawrence Livermore Labs in the late 1970s.

The objective of the Fletcher checksum was to provide error-detection properties approaching those of a cyclic redundancy check but with the lower computational effort associated with summation techniques.

**Example:**
```json
{ "name": "cyberchef_fletcher_32_checksum", "arguments": { "input": "..." } }
```

---

#### Fletcher-64 Checksum (`cyberchef_fletcher_64_checksum`)
The Fletcher checksum is an algorithm for computing a position-dependent checksum devised by John Gould Fletcher at Lawrence Livermore Labs in the late 1970s.

The objective of the Fletcher checksum was to provide error-detection properties approaching those of a cyclic redundancy check but with the lower computational effort associated with summation techniques.

**Example:**
```json
{ "name": "cyberchef_fletcher_64_checksum", "arguments": { "input": "..." } }
```

---

#### Adler-32 Checksum (`cyberchef_adler_32_checksum`)
Adler-32 is a checksum algorithm which was invented by Mark Adler in 1995, and is a modification of the Fletcher checksum. Compared to a cyclic redundancy check of the same length, it trades reliability for speed (preferring the latter).

Adler-32 is more reliable than Fletcher-16, and slightly less reliable than Fletcher-32.

**Example:**
```json
{ "name": "cyberchef_adler_32_checksum", "arguments": { "input": "..." } }
```

---

#### Luhn Checksum (`cyberchef_luhn_checksum`)
The Luhn mod N algorithm using the english alphabet. The Luhn mod N algorithm is an extension to the Luhn algorithm (also known as mod 10 algorithm) that allows it to work with sequences of values in any even-numbered base. This can be useful when a check digit is required to validate an identification string composed of letters, a combination of letters and digits or any arbitrary set of N characters where N is divisible by 2.

**Arguments:**
*   `radix` (number): Default: 10

**Example:**
```json
{ "name": "cyberchef_luhn_checksum", "arguments": { "input": "..." } }
```

---

#### CRC Checksum (`cyberchef_crc_checksum`)
A Cyclic Redundancy Check (CRC) is an error-detecting code commonly used in digital networks and storage devices to detect accidental changes to raw data.

**Arguments:**
*   `algorithm` (argSelector): Default: [object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object],[object Object]
*   `width_(bits)` (toggleString): Default: 0
*   `polynomial` (toggleString): Default: 0
*   `initialization` (toggleString): Default: 0
*   `reflect_input` (Enum: [True, False]): Default: True,False
*   `reflect_output` (Enum: [True, False]): Default: True,False
*   `xor_output` (toggleString): Default: 0

**Example:**
```json
{ "name": "cyberchef_crc_checksum", "arguments": { "input": "..." } }
```

---

#### TCP/IP Checksum (`cyberchef_tcp_ip_checksum`)
Calculates the checksum for a TCP (Transport Control Protocol) or IP (Internet Protocol) header from an input of raw bytes.

**Example:**
```json
{ "name": "cyberchef_tcp_ip_checksum", "arguments": { "input": "..." } }
```

---

#### XOR Checksum (`cyberchef_xor_checksum`)
XOR Checksum splits the input into blocks of a configurable size and performs the XOR operation on these blocks.

**Arguments:**
*   `blocksize` (number): Default: 4

**Example:**
```json
{ "name": "cyberchef_xor_checksum", "arguments": { "input": "..." } }
```

---

### Code tidy

#### Syntax highlighter (`cyberchef_syntax_highlighter`)
Adds syntax highlighting to a range of source code languages. Note that this will not indent the code. Use one of the 'Beautify' operations for that.

**Arguments:**
*   `language` (Enum: [auto detect, 1c, abnf, accesslog, actionscript, ...]): Default: auto detect,1c,abnf,accesslog,actionscript,ada,angelscript,apache,applescript,arcade,arduino,armasm,xml,asciidoc,aspectj,autohotkey,autoit,avrasm,awk,axapta,bash,basic,bnf,brainfuck,c,cal,capnproto,ceylon,clean,clojure,clojure-repl,cmake,coffeescript,coq,cos,cpp,crmsh,crystal,csharp,csp,css,d,markdown,dart,delphi,diff,django,dns,dockerfile,dos,dsconfig,dts,dust,ebnf,elixir,elm,ruby,erb,erlang-repl,erlang,excel,fix,flix,fortran,fsharp,gams,gauss,gcode,gherkin,glsl,gml,go,golo,gradle,graphql,groovy,haml,handlebars,haskell,haxe,hsp,http,hy,inform7,ini,irpf90,isbl,java,javascript,jboss-cli,json,julia,julia-repl,kotlin,lasso,latex,ldif,leaf,less,lisp,livecodeserver,livescript,llvm,lsl,lua,makefile,mathematica,matlab,maxima,mel,mercury,mipsasm,mizar,perl,mojolicious,monkey,moonscript,n1ql,nestedtext,nginx,nim,nix,node-repl,nsis,objectivec,ocaml,openscad,oxygene,parser3,pf,pgsql,php,php-template,plaintext,pony,powershell,processing,profile,prolog,properties,protobuf,puppet,purebasic,python,python-repl,q,qml,r,reasonml,rib,roboconf,routeros,rsl,ruleslanguage,rust,sas,scala,scheme,scilab,scss,shell,smali,smalltalk,sml,sqf,sql,stan,stata,step21,stylus,subunit,swift,taggerscript,yaml,tap,tcl,thrift,tp,twig,typescript,vala,vbnet,vbscript,vbscript-html,verilog,vhdl,vim,wasm,wren,x86asm,xl,xquery,zephir

**Example:**
```json
{ "name": "cyberchef_syntax_highlighter", "arguments": { "input": "..." } }
```

---

#### Generic Code Beautify (`cyberchef_generic_code_beautify`)
Attempts to pretty print C-style languages such as C, C++, C#, Java, PHP, JavaScript etc.

This will not do a perfect job, and the resulting code may not work any more. This operation is designed purely to make obfuscated or minified code more easy to read and understand.

Things which will not work properly:For loop formattingDo-While loop formattingSwitch/Case indentationCertain bit shift operators

**Example:**
```json
{ "name": "cyberchef_generic_code_beautify", "arguments": { "input": "..." } }
```

---

#### JavaScript Parser (`cyberchef_javascript_parser`)
Returns an Abstract Syntax Tree for valid JavaScript code.

**Arguments:**
*   `location_info` (boolean): Default: false
*   `range_info` (boolean): Default: false
*   `include_tokens_array` (boolean): Default: false
*   `include_comments_array` (boolean): Default: false
*   `report_errors_and_try_to_continue` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_javascript_parser", "arguments": { "input": "..." } }
```

---

#### JavaScript Beautify (`cyberchef_javascript_beautify`)
Parses and pretty prints valid JavaScript code. Also works with JavaScript Object Notation (JSON).

**Arguments:**
*   `indent_string` (binaryShortString): Default: \t
*   `quotes` (Enum: [Auto, Single, Double]): Default: Auto,Single,Double
*   `semicolons_before_closing_braces` (boolean): Default: true
*   `include_comments` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_javascript_beautify", "arguments": { "input": "..." } }
```

---

#### JavaScript Minify (`cyberchef_javascript_minify`)
Compresses JavaScript code.

**Example:**
```json
{ "name": "cyberchef_javascript_minify", "arguments": { "input": "..." } }
```

---

#### JSON Beautify (`cyberchef_json_beautify`)
Indents and pretty prints JavaScript Object Notation (JSON) code.

Tags: json viewer, prettify, syntax highlighting

**Arguments:**
*   `indent_string` (binaryShortString): Default:     
*   `sort_object_keys` (boolean): Default: false
*   `formatted` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_json_beautify", "arguments": { "input": "..." } }
```

---

#### JSON Minify (`cyberchef_json_minify`)
Compresses JavaScript Object Notation (JSON) code.

**Example:**
```json
{ "name": "cyberchef_json_minify", "arguments": { "input": "..." } }
```

---

#### XML Beautify (`cyberchef_xml_beautify`)
Indents and prettifies eXtensible Markup Language (XML) code.

**Arguments:**
*   `indent_string` (binaryShortString): Default: \t

**Example:**
```json
{ "name": "cyberchef_xml_beautify", "arguments": { "input": "..." } }
```

---

#### XML Minify (`cyberchef_xml_minify`)
Compresses eXtensible Markup Language (XML) code.

**Arguments:**
*   `preserve_comments` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_xml_minify", "arguments": { "input": "..." } }
```

---

#### SQL Beautify (`cyberchef_sql_beautify`)
Indents and prettifies Structured Query Language (SQL) code.

**Arguments:**
*   `indent_string` (binaryShortString): Default: \t

**Example:**
```json
{ "name": "cyberchef_sql_beautify", "arguments": { "input": "..." } }
```

---

#### SQL Minify (`cyberchef_sql_minify`)
Compresses Structured Query Language (SQL) code.

**Example:**
```json
{ "name": "cyberchef_sql_minify", "arguments": { "input": "..." } }
```

---

#### CSS Beautify (`cyberchef_css_beautify`)
Indents and prettifies Cascading Style Sheets (CSS) code.

**Arguments:**
*   `indent_string` (binaryShortString): Default: \t

**Example:**
```json
{ "name": "cyberchef_css_beautify", "arguments": { "input": "..." } }
```

---

#### CSS Minify (`cyberchef_css_minify`)
Compresses Cascading Style Sheets (CSS) code.

**Arguments:**
*   `preserve_comments` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_css_minify", "arguments": { "input": "..." } }
```

---

#### XPath expression (`cyberchef_xpath_expression`)
Extract information from an XML document with an XPath query

**Arguments:**
*   `xpath` (string): Default: ""
*   `result_delimiter` (binaryShortString): Default: \n

**Example:**
```json
{ "name": "cyberchef_xpath_expression", "arguments": { "input": "..." } }
```

---

#### JPath expression (`cyberchef_jpath_expression`)
Extract information from a JSON object with a JPath query.

**Arguments:**
*   `query` (string): Default: ""
*   `result_delimiter` (binaryShortString): Default: \n

**Example:**
```json
{ "name": "cyberchef_jpath_expression", "arguments": { "input": "..." } }
```

---

#### Jq (`cyberchef_jq`)
jq is a lightweight and flexible command-line JSON processor.

**Arguments:**
*   `query` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_jq", "arguments": { "input": "..." } }
```

---

#### CSS selector (`cyberchef_css_selector`)
Extract information from an HTML document with a CSS selector

**Arguments:**
*   `css_selector` (string): Default: ""
*   `delimiter` (binaryShortString): Default: \n

**Example:**
```json
{ "name": "cyberchef_css_selector", "arguments": { "input": "..." } }
```

---

#### PHP Deserialize (`cyberchef_php_deserialize`)
Deserializes PHP serialized data, outputting keyed arrays as JSON.

This function does not support object tags.

Example:
a:2:{s:1:&quot;a&quot;;i:10;i:0;a:1:{s:2:&quot;ab&quot;;b:1;}}
becomes
{&quot;a&quot;: 10,0: {&quot;ab&quot;: true}}

Output valid JSON: JSON doesn't support integers as keys, whereas PHP serialization does. Enabling this will cast these integers to strings. This will also escape backslashes.

**Arguments:**
*   `output_valid_json` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_php_deserialize", "arguments": { "input": "..." } }
```

---

#### PHP Serialize (`cyberchef_php_serialize`)
Performs PHP serialization on JSON data.

This function does not support object tags.

Since PHP doesn't distinguish dicts and arrays, this operation is not always symmetric to PHP Deserialize.

Example:
[5,&quot;abc&quot;,true]
becomes
a:3:{i:0;i:5;i:1;s:3:&quot;abc&quot;;i:2;b:1;}

**Example:**
```json
{ "name": "cyberchef_php_serialize", "arguments": { "input": "..." } }
```

---

#### Microsoft Script Decoder (`cyberchef_microsoft_script_decoder`)
Decodes Microsoft Encoded Script files that have been encoded with Microsoft's custom encoding. These are often VBS (Visual Basic Script) files that are encoded and renamed with a '.vbe' extention or JS (JScript) files renamed with a '.jse' extention.

Sample

Encoded:
#@~^RQAAAA==-mD~sX|:/TP{~J:+dYbxL~@!F@*@!+@*@!&amp;@*eEI@#@&amp;@#@&amp;.jm.raY 214Wv:zms/obI0xEAAA==^#~@

Decoded:
var my_msg = &#34;Testing !&#34;;

VScript.Echo(my_msg);

**Example:**
```json
{ "name": "cyberchef_microsoft_script_decoder", "arguments": { "input": "..." } }
```

---

#### Strip HTML tags (`cyberchef_strip_html_tags`)
Removes all HTML tags from the input.

**Arguments:**
*   `remove_indentation` (boolean): Default: true
*   `remove_excess_line_breaks` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_strip_html_tags", "arguments": { "input": "..." } }
```

---

#### Diff (`cyberchef_diff`)
Compares two inputs (separated by the specified delimiter) and highlights the differences between them.

**Arguments:**
*   `sample_delimiter` (binaryString): Default: \n\n
*   `diff_by` (Enum: [Character, Word, Line, Sentence, CSS, ...]): Default: Character,Word,Line,Sentence,CSS,JSON
*   `show_added` (boolean): Default: true
*   `show_removed` (boolean): Default: true
*   `show_subtraction` (boolean): Default: false
*   `ignore_whitespace` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_diff", "arguments": { "input": "..." } }
```

---

#### To Snake case (`cyberchef_to_snake_case`)
Converts the input string to snake case.



Snake case is all lower case with underscores as word boundaries.



e.g. this_is_snake_case



'Attempt to be context aware' will make the operation attempt to nicely transform variable and function names.

**Arguments:**
*   `attempt_to_be_context_aware` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_to_snake_case", "arguments": { "input": "..." } }
```

---

#### To Camel case (`cyberchef_to_camel_case`)
Converts the input string to camel case.



Camel case is all lower case except letters after word boundaries which are uppercase.



e.g. thisIsCamelCase



'Attempt to be context aware' will make the operation attempt to nicely transform variable and function names.

**Arguments:**
*   `attempt_to_be_context_aware` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_to_camel_case", "arguments": { "input": "..." } }
```

---

#### To Kebab case (`cyberchef_to_kebab_case`)
Converts the input string to kebab case.



Kebab case is all lower case with dashes as word boundaries.



e.g. this-is-kebab-case



'Attempt to be context aware' will make the operation attempt to nicely transform variable and function names.

**Arguments:**
*   `attempt_to_be_context_aware` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_to_kebab_case", "arguments": { "input": "..." } }
```

---

#### BSON serialise (`cyberchef_bson_serialise`)
BSON is a computer data interchange format used mainly as a data storage and network transfer format in the MongoDB database. It is a binary form for representing simple data structures, associative arrays (called objects or documents in MongoDB), and various data types of specific interest to MongoDB. The name 'BSON' is based on the term JSON and stands for 'Binary JSON'.

Input data should be valid JSON.

**Example:**
```json
{ "name": "cyberchef_bson_serialise", "arguments": { "input": "..." } }
```

---

#### BSON deserialise (`cyberchef_bson_deserialise`)
BSON is a computer data interchange format used mainly as a data storage and network transfer format in the MongoDB database. It is a binary form for representing simple data structures, associative arrays (called objects or documents in MongoDB), and various data types of specific interest to MongoDB. The name 'BSON' is based on the term JSON and stands for 'Binary JSON'.

Input data should be in a raw bytes format.

**Example:**
```json
{ "name": "cyberchef_bson_deserialise", "arguments": { "input": "..." } }
```

---

#### To MessagePack (`cyberchef_to_messagepack`)
Converts JSON to MessagePack encoded byte buffer. MessagePack is a computer data interchange format. It is a binary form for representing simple data structures like arrays and associative arrays.

**Example:**
```json
{ "name": "cyberchef_to_messagepack", "arguments": { "input": "..." } }
```

---

#### From MessagePack (`cyberchef_from_messagepack`)
Converts MessagePack encoded data to JSON. MessagePack is a computer data interchange format. It is a binary form for representing simple data structures like arrays and associative arrays.

**Example:**
```json
{ "name": "cyberchef_from_messagepack", "arguments": { "input": "..." } }
```

---

#### Render Markdown (`cyberchef_render_markdown`)
Renders input Markdown as HTML. HTML rendering is disabled to avoid XSS.

**Arguments:**
*   `autoconvert_urls_to_links` (boolean): Default: false
*   `enable_syntax_highlighting` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_render_markdown", "arguments": { "input": "..." } }
```

---

### Forensics

#### Detect File Type (`cyberchef_detect_file_type`)
Attempts to guess the MIME (Multipurpose Internet Mail Extensions) type of the data based on 'magic bytes'.

Currently supports the following file types: 123d, 7z, B64, abcdp, accda, accdb, accde, accdu, ace, ai, aif, aifc, alz, amr, arj, arw, au, auf, avi, axf, bash, bct, bin, bitlocker, bk!, bmp, bplist, bz2, cab, cat, cer, chi, chm, chw, class, com, cr2, crl, crt, crw, crx, db, dbx, deb, der, dex, dll, dmf, dmg, dmp, doc, docx, dot, drv, dwg, dwt, dylib, edb, elf, eot, eps, epub, evt, evtx, exe, f4v, fdb, flac, flv, fon, gif, gpg, gz, hbin, hdr, heic, heif, hqx, ichat, ico, ipmeta, iso, jar, job, jpe, jpeg, jpg, jxr, keychain, kgb, lnk, luac, lzo, lzop, m4a, m4v, mda, mdb, mdbackup, mde, mdi, mdinfo, mdt, midi, mkv, mov, mp3, mp4, mpg, mpo, mrw, msg, msi, nib, o, ocx, ogg, ogm, ogv, ogx, ole2, one, opus, ost, otf, p7b, p7c, p7m, p7s, pab, pdf, pf, pfa, pgd, phar, php, php-s, php3, php4, php5, php7, phps, pht, phtml, pkr, pl, plist, pm, png, pod, pot, ppa, pps, ppt, pptx, prx, ps, psa, psb, psd, psp, pst, pwl, py, pyc, pyd, pyo, pyw, pyz, qtz, raf, rar, rb, registry, rgs, rsa, rtf, scr, sdw, sh, skr, sml, so, sqlite, strings, swf, swz, sys, t, tar, tar.z, tcp, tga, thm, tif, torrent, ttf, txt, udp, utf16le, utf32le, vbx, vhd, vmdk, vsd, vxd, wallet, wasm, wav, wcm, webbookmark, webhistory, webm, webp, wmv, woff, woff2, wp, wp5, wp6, wpd, wpp, xcf, xla, xls, xlsx, xz, zip, zlib.

**Arguments:**
*   `images` (boolean): Default: true
*   `video` (boolean): Default: true
*   `audio` (boolean): Default: true
*   `documents` (boolean): Default: true
*   `applications` (boolean): Default: true
*   `archives` (boolean): Default: true
*   `miscellaneous` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_detect_file_type", "arguments": { "input": "..." } }
```

---

#### Scan for Embedded Files (`cyberchef_scan_for_embedded_files`)
Scans the data for potential embedded files by looking for magic bytes at all offsets. This operation is prone to false positives.

WARNING: Files over about 100KB in size will take a VERY long time to process.

**Arguments:**
*   `images` (boolean): Default: true
*   `video` (boolean): Default: true
*   `audio` (boolean): Default: true
*   `documents` (boolean): Default: true
*   `applications` (boolean): Default: true
*   `archives` (boolean): Default: true
*   `miscellaneous` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_scan_for_embedded_files", "arguments": { "input": "..." } }
```

---

#### Extract Files (`cyberchef_extract_files`)
Performs file carving to attempt to extract files from the input.

This operation is currently capable of carving out the following formats:
            
                
                JPG,JPEG,JPE,THM,MPOGIFPNGWEBPBMPICOTGAFLVWAVMP3PDFRTFDOCX,XLSX,PPTXEPUBEXE,DLL,DRV,VXD,SYS,OCX,VBX,COM,FON,SCRELF,BIN,AXF,O,PRX,SODYLIBZIPTARGZBZ2ZLIBXZJARLZOP,LZODEBSQLITEEVTEVTXDMPPFPLISTKEYCHAINLNK
                
            Minimum File Size can be used to prune small false positives.

**Arguments:**
*   `images` (boolean): Default: true
*   `video` (boolean): Default: true
*   `audio` (boolean): Default: true
*   `documents` (boolean): Default: true
*   `applications` (boolean): Default: true
*   `archives` (boolean): Default: true
*   `miscellaneous` (boolean): Default: false
*   `ignore_failed_extractions` (boolean): Default: true
*   `minimum_file_size` (number): Default: 100

**Example:**
```json
{ "name": "cyberchef_extract_files", "arguments": { "input": "..." } }
```

---

#### YARA Rules (`cyberchef_yara_rules`)
YARA is a tool developed at VirusTotal, primarily aimed at helping malware researchers to identify and classify malware samples. It matches based on rules specified by the user containing textual or binary patterns and a boolean expression. For help on writing rules, see the YARA documentation.

**Arguments:**
*   `rules` (text): Default: ""
*   `show_strings` (boolean): Default: false
*   `show_string_lengths` (boolean): Default: false
*   `show_metadata` (boolean): Default: false
*   `show_counts` (boolean): Default: true
*   `show_rule_warnings` (boolean): Default: true
*   `show_console_module_messages` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_yara_rules", "arguments": { "input": "..." } }
```

---

#### Remove EXIF (`cyberchef_remove_exif`)
Removes EXIF data from a JPEG image.



EXIF data embedded in photos usually contains information about the image file itself as well as the device used to create it.

**Example:**
```json
{ "name": "cyberchef_remove_exif", "arguments": { "input": "..." } }
```

---

#### Extract EXIF (`cyberchef_extract_exif`)
Extracts EXIF data from an image.



EXIF data is metadata embedded in images (JPEG, JPG, TIFF) and audio files.



EXIF data from photos usually contains information about the image file itself as well as the device used to create it.

**Example:**
```json
{ "name": "cyberchef_extract_exif", "arguments": { "input": "..." } }
```

---

#### Extract RGBA (`cyberchef_extract_rgba`)
Extracts each pixel's RGBA value in an image. These are sometimes used in Steganography to hide text or data.

**Arguments:**
*   `delimiter` (Enum: [Comma, Space, CRLF, Line Feed]): Default: [object Object],[object Object],[object Object],[object Object]
*   `include_alpha` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_extract_rgba", "arguments": { "input": "..." } }
```

---

#### View Bit Plane (`cyberchef_view_bit_plane`)
Extracts and displays a bit plane of any given image. These show only a single bit from each pixel, and can be used to hide messages in Steganography.

**Arguments:**
*   `colour` (Enum: [Red, Green, Blue, Alpha]): Default: Red,Green,Blue,Alpha
*   `bit` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_view_bit_plane", "arguments": { "input": "..." } }
```

---

#### Randomize Colour Palette (`cyberchef_randomize_colour_palette`)
Randomizes each colour in an image's colour palette. This can often reveal text or symbols that were previously a very similar colour to their surroundings, a technique sometimes used in Steganography.

**Arguments:**
*   `seed` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_randomize_colour_palette", "arguments": { "input": "..." } }
```

---

#### Extract LSB (`cyberchef_extract_lsb`)
Extracts the Least Significant Bit data from each pixel in an image. This is a common way to hide data in Steganography.

**Arguments:**
*   `colour_pattern_#1` (Enum: [R, G, B, A]): Default: R,G,B,A
*   `colour_pattern_#2` (Enum: [, R, G, B, A]): Default: ,R,G,B,A
*   `colour_pattern_#3` (Enum: [, R, G, B, A]): Default: ,R,G,B,A
*   `colour_pattern_#4` (Enum: [, R, G, B, A]): Default: ,R,G,B,A
*   `pixel_order` (Enum: [Row, Column]): Default: Row,Column
*   `bit` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_extract_lsb", "arguments": { "input": "..." } }
```

---

#### ELF Info (`cyberchef_elf_info`)
Implements readelf-like functionality. This operation will extract the ELF Header, Program Headers, Section Headers and Symbol Table for an ELF file.

**Example:**
```json
{ "name": "cyberchef_elf_info", "arguments": { "input": "..." } }
```

---

### Multimedia

#### Render Image (`cyberchef_render_image`)
Displays the input as an image. Supports the following formats:

jpg/jpegpnggifwebpbmpico

**Arguments:**
*   `input_format` (Enum: [Raw, Base64, Hex]): Default: Raw,Base64,Hex

**Example:**
```json
{ "name": "cyberchef_render_image", "arguments": { "input": "..." } }
```

---

#### Play Media (`cyberchef_play_media`)
Plays the input as audio or video depending on the type.

Tags: sound, movie, mp3, mp4, mov, webm, wav, ogg

**Arguments:**
*   `input_format` (Enum: [Raw, Base64, Hex]): Default: Raw,Base64,Hex

**Example:**
```json
{ "name": "cyberchef_play_media", "arguments": { "input": "..." } }
```

---

#### Generate Image (`cyberchef_generate_image`)
Generates an image using the input as pixel values.

**Arguments:**
*   `mode` (Enum: [Greyscale, RG, RGB, RGBA, Bits]): Default: Greyscale,RG,RGB,RGBA,Bits
*   `pixel_scale_factor` (number): Default: 8
*   `pixels_per_row` (number): Default: 64

**Example:**
```json
{ "name": "cyberchef_generate_image", "arguments": { "input": "..." } }
```

---

#### Optical Character Recognition (`cyberchef_optical_character_recognition`)
Optical character recognition or optical character reader (OCR) is the mechanical or electronic conversion of images of typed, handwritten or printed text into machine-encoded text.

Supported image formats: png, jpg, bmp, pbm.

**Arguments:**
*   `show_confidence` (boolean): Default: true
*   `ocr_engine_mode` (Enum: [Tesseract only, LSTM only, Tesseract/LSTM Combined]): Default: Tesseract only,LSTM only,Tesseract/LSTM Combined

**Example:**
```json
{ "name": "cyberchef_optical_character_recognition", "arguments": { "input": "..." } }
```

---

#### Remove EXIF (`cyberchef_remove_exif`)
Removes EXIF data from a JPEG image.



EXIF data embedded in photos usually contains information about the image file itself as well as the device used to create it.

**Example:**
```json
{ "name": "cyberchef_remove_exif", "arguments": { "input": "..." } }
```

---

#### Extract EXIF (`cyberchef_extract_exif`)
Extracts EXIF data from an image.



EXIF data is metadata embedded in images (JPEG, JPG, TIFF) and audio files.



EXIF data from photos usually contains information about the image file itself as well as the device used to create it.

**Example:**
```json
{ "name": "cyberchef_extract_exif", "arguments": { "input": "..." } }
```

---

#### Split Colour Channels (`cyberchef_split_colour_channels`)
Splits the given image into its red, green and blue colour channels.

**Example:**
```json
{ "name": "cyberchef_split_colour_channels", "arguments": { "input": "..." } }
```

---

#### Rotate Image (`cyberchef_rotate_image`)
Rotates an image by the specified number of degrees.

**Arguments:**
*   `rotation_amount_(degrees)` (number): Default: 90

**Example:**
```json
{ "name": "cyberchef_rotate_image", "arguments": { "input": "..." } }
```

---

#### Resize Image (`cyberchef_resize_image`)
Resizes an image to the specified width and height values.

**Arguments:**
*   `width` (number): Default: 100
*   `height` (number): Default: 100
*   `unit_type` (Enum: [Pixels, Percent]): Default: Pixels,Percent
*   `maintain_aspect_ratio` (boolean): Default: false
*   `resizing_algorithm` (Enum: [Nearest Neighbour, Bilinear, Bicubic, Hermite, Bezier]): Default: Nearest Neighbour,Bilinear,Bicubic,Hermite,Bezier

**Example:**
```json
{ "name": "cyberchef_resize_image", "arguments": { "input": "..." } }
```

---

#### Blur Image (`cyberchef_blur_image`)
Applies a blur effect to the image.

Gaussian blur is much slower than fast blur, but produces better results.

**Arguments:**
*   `amount` (number): Default: 5
*   `type` (Enum: [Fast, Gaussian]): Default: Fast,Gaussian

**Example:**
```json
{ "name": "cyberchef_blur_image", "arguments": { "input": "..." } }
```

---

#### Dither Image (`cyberchef_dither_image`)
Apply a dither effect to an image.

**Example:**
```json
{ "name": "cyberchef_dither_image", "arguments": { "input": "..." } }
```

---

#### Invert Image (`cyberchef_invert_image`)
Invert the colours of an image.

**Example:**
```json
{ "name": "cyberchef_invert_image", "arguments": { "input": "..." } }
```

---

#### Flip Image (`cyberchef_flip_image`)
Flips an image along its X or Y axis.

**Arguments:**
*   `axis` (Enum: [Horizontal, Vertical]): Default: Horizontal,Vertical

**Example:**
```json
{ "name": "cyberchef_flip_image", "arguments": { "input": "..." } }
```

---

#### Crop Image (`cyberchef_crop_image`)
Crops an image to the specified region, or automatically crops edges.

Autocrop
Automatically crops same-colour borders from the image.

Autocrop tolerance
A percentage value for the tolerance of colour difference between pixels.

Only autocrop frames
Only crop real frames (all sides must have the same border)

Symmetric autocrop
Force autocrop to be symmetric (top/bottom and left/right are cropped by the same amount)

Autocrop keep border
The number of pixels of border to leave around the image.

**Arguments:**
*   `x_position` (number): Default: 0
*   `y_position` (number): Default: 0
*   `width` (number): Default: 10
*   `height` (number): Default: 10
*   `autocrop` (boolean): Default: false
*   `autocrop_tolerance_(%)` (number): Default: 0.02
*   `only_autocrop_frames` (boolean): Default: true
*   `symmetric_autocrop` (boolean): Default: false
*   `autocrop_keep_border_(px)` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_crop_image", "arguments": { "input": "..." } }
```

---

#### Image Brightness / Contrast (`cyberchef_image_brightness_contrast`)
Adjust the brightness or contrast of an image.

**Arguments:**
*   `brightness` (number): Default: 0
*   `contrast` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_image_brightness_contrast", "arguments": { "input": "..." } }
```

---

#### Image Opacity (`cyberchef_image_opacity`)
Adjust the opacity of an image.

**Arguments:**
*   `opacity_(%)` (number): Default: 100

**Example:**
```json
{ "name": "cyberchef_image_opacity", "arguments": { "input": "..." } }
```

---

#### Image Filter (`cyberchef_image_filter`)
Applies a greyscale or sepia filter to an image.

**Arguments:**
*   `filter_type` (Enum: [Greyscale, Sepia]): Default: Greyscale,Sepia

**Example:**
```json
{ "name": "cyberchef_image_filter", "arguments": { "input": "..." } }
```

---

#### Contain Image (`cyberchef_contain_image`)
Scales an image to the specified width and height, maintaining the aspect ratio. The image may be letterboxed.

**Arguments:**
*   `width` (number): Default: 100
*   `height` (number): Default: 100
*   `horizontal_align` (Enum: [Left, Center, Right]): Default: Left,Center,Right
*   `vertical_align` (Enum: [Top, Middle, Bottom]): Default: Top,Middle,Bottom
*   `resizing_algorithm` (Enum: [Nearest Neighbour, Bilinear, Bicubic, Hermite, Bezier]): Default: Nearest Neighbour,Bilinear,Bicubic,Hermite,Bezier
*   `opaque_background` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_contain_image", "arguments": { "input": "..." } }
```

---

#### Cover Image (`cyberchef_cover_image`)
Scales the image to the given width and height, keeping the aspect ratio. The image may be clipped.

**Arguments:**
*   `width` (number): Default: 100
*   `height` (number): Default: 100
*   `horizontal_align` (Enum: [Left, Center, Right]): Default: Left,Center,Right
*   `vertical_align` (Enum: [Top, Middle, Bottom]): Default: Top,Middle,Bottom
*   `resizing_algorithm` (Enum: [Nearest Neighbour, Bilinear, Bicubic, Hermite, Bezier]): Default: Nearest Neighbour,Bilinear,Bicubic,Hermite,Bezier

**Example:**
```json
{ "name": "cyberchef_cover_image", "arguments": { "input": "..." } }
```

---

#### Image Hue/Saturation/Lightness (`cyberchef_image_hue_saturation_lightness`)
Adjusts the hue / saturation / lightness (HSL) values of an image.

**Arguments:**
*   `hue` (number): Default: 0
*   `saturation` (number): Default: 0
*   `lightness` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_image_hue_saturation_lightness", "arguments": { "input": "..." } }
```

---

#### Sharpen Image (`cyberchef_sharpen_image`)
Sharpens an image (Unsharp mask)

**Arguments:**
*   `radius` (number): Default: 2
*   `amount` (number): Default: 1
*   `threshold` (number): Default: 10

**Example:**
```json
{ "name": "cyberchef_sharpen_image", "arguments": { "input": "..." } }
```

---

#### Normalise Image (`cyberchef_normalise_image`)
Normalise the image colours.

**Example:**
```json
{ "name": "cyberchef_normalise_image", "arguments": { "input": "..." } }
```

---

#### Convert Image Format (`cyberchef_convert_image_format`)
Converts an image between different formats. Supported formats:
Joint Photographic Experts Group (JPEG)Portable Network Graphics (PNG)Bitmap (BMP)Tagged Image File Format (TIFF)
Note: GIF files are supported for input, but cannot be outputted.

**Arguments:**
*   `output_format` (Enum: [JPEG, PNG, BMP, TIFF]): Default: JPEG,PNG,BMP,TIFF
*   `jpeg_quality` (number): Default: 80
*   `png_filter_type` (Enum: [Auto, None, Sub, Up, Average, ...]): Default: Auto,None,Sub,Up,Average,Paeth
*   `png_deflate_level` (number): Default: 9

**Example:**
```json
{ "name": "cyberchef_convert_image_format", "arguments": { "input": "..." } }
```

---

#### Add Text To Image (`cyberchef_add_text_to_image`)
Adds text onto an image.

Text can be horizontally or vertically aligned, or the position can be manually specified.
Variants of the Roboto font face are available in any size or colour.

**Arguments:**
*   `text` (string): Default: ""
*   `horizontal_align` (Enum: [None, Left, Center, Right]): Default: None,Left,Center,Right
*   `vertical_align` (Enum: [None, Top, Middle, Bottom]): Default: None,Top,Middle,Bottom
*   `x_position` (number): Default: 0
*   `y_position` (number): Default: 0
*   `size` (number): Default: 32
*   `font_face` (Enum: [Roboto, Roboto Black, Roboto Mono, Roboto Slab]): Default: Roboto,Roboto Black,Roboto Mono,Roboto Slab
*   `red` (number): Default: 255
*   `green` (number): Default: 255
*   `blue` (number): Default: 255
*   `alpha` (number): Default: 255

**Example:**
```json
{ "name": "cyberchef_add_text_to_image", "arguments": { "input": "..." } }
```

---

#### Hex Density chart (`cyberchef_hex_density_chart`)
Hex density charts are used in a similar way to scatter charts, however rather than rendering tens of thousands of points, it groups the points into a few hundred hexagons to show the distribution.

**Arguments:**
*   `record_delimiter` (Enum: [Line feed, CRLF]): Default: Line feed,CRLF
*   `field_delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Tab]): Default: Space,Comma,Semi-colon,Colon,Tab
*   `pack_radius` (number): Default: 25
*   `draw_radius` (number): Default: 15
*   `use_column_headers_as_labels` (boolean): Default: true
*   `x_label` (string): Default: ""
*   `y_label` (string): Default: ""
*   `draw_hexagon_edges` (boolean): Default: false
*   `min_colour_value` (string): Default: white
*   `max_colour_value` (string): Default: black
*   `draw_empty_hexagons_within_data_boundaries` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_hex_density_chart", "arguments": { "input": "..." } }
```

---

#### Scatter chart (`cyberchef_scatter_chart`)
Plots two-variable data as single points on a graph.

**Arguments:**
*   `record_delimiter` (Enum: [Line feed, CRLF]): Default: Line feed,CRLF
*   `field_delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Tab]): Default: Space,Comma,Semi-colon,Colon,Tab
*   `use_column_headers_as_labels` (boolean): Default: true
*   `x_label` (string): Default: ""
*   `y_label` (string): Default: ""
*   `colour` (string): Default: black
*   `point_radius` (number): Default: 10
*   `use_colour_from_third_column` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_scatter_chart", "arguments": { "input": "..." } }
```

---

#### Series chart (`cyberchef_series_chart`)
A time series graph is a line graph of repeated measurements taken over regular time intervals.

**Arguments:**
*   `record_delimiter` (Enum: [Line feed, CRLF]): Default: Line feed,CRLF
*   `field_delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Tab]): Default: Space,Comma,Semi-colon,Colon,Tab
*   `x_label` (string): Default: ""
*   `point_radius` (number): Default: 1
*   `series_colours` (string): Default: mediumseagreen, dodgerblue, tomato

**Example:**
```json
{ "name": "cyberchef_series_chart", "arguments": { "input": "..." } }
```

---

#### Heatmap chart (`cyberchef_heatmap_chart`)
A heatmap is a graphical representation of data where the individual values contained in a matrix are represented as colors.

**Arguments:**
*   `record_delimiter` (Enum: [Line feed, CRLF]): Default: Line feed,CRLF
*   `field_delimiter` (Enum: [Space, Comma, Semi-colon, Colon, Tab]): Default: Space,Comma,Semi-colon,Colon,Tab
*   `number_of_vertical_bins` (number): Default: 25
*   `number_of_horizontal_bins` (number): Default: 25
*   `use_column_headers_as_labels` (boolean): Default: true
*   `x_label` (string): Default: ""
*   `y_label` (string): Default: ""
*   `draw_bin_edges` (boolean): Default: false
*   `min_colour_value` (string): Default: white
*   `max_colour_value` (string): Default: black

**Example:**
```json
{ "name": "cyberchef_heatmap_chart", "arguments": { "input": "..." } }
```

---

### Other

#### Entropy (`cyberchef_entropy`)
Shannon Entropy, in the context of information theory, is a measure of the rate at which information is produced by a source of data. It can be used, in a broad sense, to detect whether data is likely to be structured or unstructured. 8 is the maximum, representing highly unstructured, 'random' data. English language text usually falls somewhere between 3.5 and 5. Properly encrypted or compressed data should have an entropy of over 7.5.

**Arguments:**
*   `visualisation` (Enum: [Shannon scale, Histogram (Bar), Histogram (Line), Curve, Image]): Default: Shannon scale,Histogram (Bar),Histogram (Line),Curve,Image

**Example:**
```json
{ "name": "cyberchef_entropy", "arguments": { "input": "..." } }
```

---

#### Frequency distribution (`cyberchef_frequency_distribution`)
Displays the distribution of bytes in the data as a graph.

**Arguments:**
*   `show_0%s` (boolean): Default: true
*   `show_ascii` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_frequency_distribution", "arguments": { "input": "..." } }
```

---

#### Index of Coincidence (`cyberchef_index_of_coincidence`)
Index of Coincidence (IC) is the probability of two randomly selected characters being the same. This can be used to determine whether text is readable or random, with English text having an IC of around 0.066. IC can therefore be a sound method to automate frequency analysis.

**Example:**
```json
{ "name": "cyberchef_index_of_coincidence", "arguments": { "input": "..." } }
```

---

#### Chi Square (`cyberchef_chi_square`)
Calculates the Chi Square distribution of values.

**Example:**
```json
{ "name": "cyberchef_chi_square", "arguments": { "input": "..." } }
```

---

#### P-list Viewer (`cyberchef_p_list_viewer`)
In the macOS, iOS, NeXTSTEP, and GNUstep programming frameworks, property list files are files that store serialized objects. Property list files use the filename extension .plist, and thus are often referred to as p-list files.

This operation displays plist files in a human readable format.

**Example:**
```json
{ "name": "cyberchef_p_list_viewer", "arguments": { "input": "..." } }
```

---

#### Disassemble x86 (`cyberchef_disassemble_x86`)
Disassembly is the process of translating machine language into assembly language.

This operation supports 64-bit, 32-bit and 16-bit code written for Intel or AMD x86 processors. It is particularly useful for reverse engineering shellcode.

Input should be in hexadecimal.

**Arguments:**
*   `bit_mode` (Enum: [64, 32, 16]): Default: 64,32,16
*   `compatibility` (Enum: [Full x86 architecture, Knights Corner, Larrabee, Cyrix, Geode, ...]): Default: Full x86 architecture,Knights Corner,Larrabee,Cyrix,Geode,Centaur,X86/486
*   `code_segment_(cs)` (number): Default: 16
*   `offset_(ip)` (number): Default: 0
*   `show_instruction_hex` (boolean): Default: true
*   `show_instruction_position` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_disassemble_x86", "arguments": { "input": "..." } }
```

---

#### Pseudo-Random Number Generator (`cyberchef_pseudo_random_number_generator`)
A cryptographically-secure pseudo-random number generator (PRNG).

This operation uses the browser's built-in crypto.getRandomValues() method if available. If this cannot be found, it falls back to a Fortuna-based PRNG algorithm.

**Arguments:**
*   `number_of_bytes` (number): Default: 32
*   `output_as` (Enum: [Hex, Integer, Byte array, Raw]): Default: Hex,Integer,Byte array,Raw

**Example:**
```json
{ "name": "cyberchef_pseudo_random_number_generator", "arguments": { "input": "..." } }
```

---

#### Generate De Bruijn Sequence (`cyberchef_generate_de_bruijn_sequence`)
Generates rolling keycode combinations given a certain alphabet size and key length.

**Arguments:**
*   `alphabet_size_(k)` (number): Default: 2
*   `key_length_(n)` (number): Default: 3

**Example:**
```json
{ "name": "cyberchef_generate_de_bruijn_sequence", "arguments": { "input": "..." } }
```

---

#### Generate UUID (`cyberchef_generate_uuid`)
Generates an RFC 9562 (formerly RFC 4122) compliant Universally Unique Identifier (UUID), also known as a Globally Unique Identifier (GUID).

We currently support generating the following UUID versions:
v1: Timestamp-basedv3: Namespace w/ MD5v4: Random (default)v5: Namespace w/ SHA-1v6: Timestamp, reorderedv7: Unix Epoch time-basedUUIDs are generated using the uuid package.


**Arguments:**
*   `version` (Enum: [v1, v3, v4, v5, v6, ...]): Default: v1,v3,v4,v5,v6,v7
*   `namespace` (string): Default: 1b671a64-40d5-491e-99b0-da01ff1f3341

**Example:**
```json
{ "name": "cyberchef_generate_uuid", "arguments": { "input": "..." } }
```

---

#### Analyse UUID (`cyberchef_analyse_uuid`)
Tries to determine information about a given UUID and suggests which version may have been used to generate it

**Example:**
```json
{ "name": "cyberchef_analyse_uuid", "arguments": { "input": "..." } }
```

---

#### Generate TOTP (`cyberchef_generate_totp`)
The Time-based One-Time Password algorithm (TOTP) is an algorithm that computes a one-time password from a shared secret key and the current time. It has been adopted as Internet Engineering Task Force standard RFC 6238, is the cornerstone of Initiative For Open Authentication (OAUTH), and is used in a number of two-factor authentication systems. A TOTP is an HOTP where the counter is the current time.

Enter the secret as the input or leave it blank for a random secret to be generated. T0 and T1 are in seconds.

**Arguments:**
*   `name` (string): Default: ""
*   `code_length` (number): Default: 6
*   `epoch_offset_(t0)` (number): Default: 0
*   `interval_(t1)` (number): Default: 30

**Example:**
```json
{ "name": "cyberchef_generate_totp", "arguments": { "input": "..." } }
```

---

#### Generate HOTP (`cyberchef_generate_hotp`)
The HMAC-based One-Time Password algorithm (HOTP) is an algorithm that computes a one-time password from a shared secret key and an incrementing counter. It has been adopted as Internet Engineering Task Force standard RFC 4226, is the cornerstone of Initiative For Open Authentication (OAUTH), and is used in a number of two-factor authentication systems.

Enter the secret as the input or leave it blank for a random secret to be generated.

**Arguments:**
*   `name` (string): Default: ""
*   `code_length` (number): Default: 6
*   `counter` (number): Default: 0

**Example:**
```json
{ "name": "cyberchef_generate_hotp", "arguments": { "input": "..." } }
```

---

#### Generate QR Code (`cyberchef_generate_qr_code`)
Generates a Quick Response (QR) code from the input text.

A QR code is a type of matrix barcode (or two-dimensional barcode) first designed in 1994 for the automotive industry in Japan. A barcode is a machine-readable optical label that contains information about the item to which it is attached.

**Arguments:**
*   `image_format` (Enum: [PNG, SVG, EPS, PDF]): Default: PNG,SVG,EPS,PDF
*   `module_size_(px)` (number): Default: 5
*   `margin_(num_modules)` (number): Default: 4
*   `error_correction` (Enum: [Low, Medium, Quartile, High]): Default: Low,Medium,Quartile,High

**Example:**
```json
{ "name": "cyberchef_generate_qr_code", "arguments": { "input": "..." } }
```

---

#### Parse QR Code (`cyberchef_parse_qr_code`)
Reads an image file and attempts to detect and read a Quick Response (QR) code from the image.

Normalise Image
Attempts to normalise the image before parsing it to improve detection of a QR code.

**Arguments:**
*   `normalise_image` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_parse_qr_code", "arguments": { "input": "..." } }
```

---

#### Haversine distance (`cyberchef_haversine_distance`)
Returns the distance between two pairs of GPS latitude and longitude co-ordinates in metres.

e.g. 51.487263,-0.124323, 38.9517,-77.1467

**Example:**
```json
{ "name": "cyberchef_haversine_distance", "arguments": { "input": "..." } }
```

---

#### HTML To Text (`cyberchef_html_to_text`)
Converts an HTML output from an operation to a readable string instead of being rendered in the DOM.

**Example:**
```json
{ "name": "cyberchef_html_to_text", "arguments": { "input": "..." } }
```

---

#### Generate Lorem Ipsum (`cyberchef_generate_lorem_ipsum`)
Generate varying length lorem ipsum placeholder text.

**Arguments:**
*   `length` (number): Default: 3
*   `length_in` (Enum: [Paragraphs, Sentences, Words, Bytes]): Default: Paragraphs,Sentences,Words,Bytes

**Example:**
```json
{ "name": "cyberchef_generate_lorem_ipsum", "arguments": { "input": "..." } }
```

---

#### Numberwang (`cyberchef_numberwang`)
Based on the popular gameshow by Mitchell and Webb.

**Example:**
```json
{ "name": "cyberchef_numberwang", "arguments": { "input": "..." } }
```

---

#### XKCD Random Number (`cyberchef_xkcd_random_number`)
RFC 1149.5 specifies 4 as the standard IEEE-vetted random number.

**Example:**
```json
{ "name": "cyberchef_xkcd_random_number", "arguments": { "input": "..." } }
```

---

### Flow control

#### Magic (`cyberchef_magic`)
The Magic operation attempts to detect various properties of the input data and suggests which operations could help to make more sense of it.

Options
Depth: If an operation appears to match the data, it will be run and the result will be analysed further. This argument controls the maximum number of levels of recursion.

Intensive mode: When this is turned on, various operations like XOR, bit rotates, and character encodings are brute-forced to attempt to detect valid data underneath. To improve performance, only the first 100 bytes of the data is brute-forced.

Extensive language support: At each stage, the relative byte frequencies of the data will be compared to average frequencies for a number of languages. The default set consists of ~40 of the most commonly used languages on the Internet. The extensive list consists of 284 languages and can result in many languages matching the data if their byte frequencies are similar.

Optionally enter a regular expression to match a string you expect to find to filter results (crib).

**Arguments:**
*   `depth` (number): Default: 3
*   `intensive_mode` (boolean): Default: false
*   `extensive_language_support` (boolean): Default: false
*   `crib_(known_plaintext_string_or_regex)` (string): Default: ""

**Example:**
```json
{ "name": "cyberchef_magic", "arguments": { "input": "..." } }
```

---

#### Fork (`cyberchef_fork`)
Split the input data up based on the specified delimiter and run all subsequent operations on each branch separately.

For example, to decode multiple Base64 strings, enter them all on separate lines then add the 'Fork' and 'From Base64' operations to the recipe. Each string will be decoded separately.

**Arguments:**
*   `split_delimiter` (binaryShortString): Default: \n
*   `merge_delimiter` (binaryShortString): Default: \n
*   `ignore_errors` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_fork", "arguments": { "input": "..." } }
```

---

#### Subsection (`cyberchef_subsection`)
Select a part of the input data using a regular expression (regex), and run all subsequent operations on each match separately.

You can use up to one capture group, where the recipe will only be run on the data in the capture group. If there's more than one capture group, only the first one will be operated on.

Use the Merge operation to reset the effects of subsection.

**Arguments:**
*   `section_(regex)` (string): Default: ""
*   `case_sensitive_matching` (boolean): Default: true
*   `global_matching` (boolean): Default: true
*   `ignore_errors` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_subsection", "arguments": { "input": "..." } }
```

---

#### Merge (`cyberchef_merge`)
Consolidate all branches back into a single trunk. The opposite of Fork. Unticking the Merge All checkbox will only consolidate all branches up to the nearest Fork/Subsection.

**Arguments:**
*   `merge_all` (boolean): Default: true

**Example:**
```json
{ "name": "cyberchef_merge", "arguments": { "input": "..." } }
```

---

#### Register (`cyberchef_register`)
Extract data from the input and store it in registers which can then be passed into subsequent operations as arguments. Regular expression capture groups are used to select the data to extract.

To use registers in arguments, refer to them using the notation $Rn where n is the register number, starting at 0.

For example:
Input: Test
Extractor: (.*)
Argument: $R0 becomes Test

Registers can be escaped in arguments using a backslash. e.g. \$R0 would become $R0 rather than Test.

**Arguments:**
*   `extractor` (binaryString): Default: ([\s\S]*)
*   `case_insensitive` (boolean): Default: true
*   `multiline_matching` (boolean): Default: false
*   `dot_matches_all` (boolean): Default: false

**Example:**
```json
{ "name": "cyberchef_register", "arguments": { "input": "..." } }
```

---

#### Label (`cyberchef_label`)
Provides a location for conditional and fixed jumps to redirect execution to.

**Arguments:**
*   `name` (shortString): Default: ""

**Example:**
```json
{ "name": "cyberchef_label", "arguments": { "input": "..." } }
```

---

#### Jump (`cyberchef_jump`)
Jump forwards or backwards to the specified Label

**Arguments:**
*   `label_name` (string): Default: ""
*   `maximum_jumps_(if_jumping_backwards)` (number): Default: 10

**Example:**
```json
{ "name": "cyberchef_jump", "arguments": { "input": "..." } }
```

---

#### Conditional Jump (`cyberchef_conditional_jump`)
Conditionally jump forwards or backwards to the specified Label  based on whether the data matches the specified regular expression.

**Arguments:**
*   `match_(regex)` (string): Default: ""
*   `invert_match` (boolean): Default: false
*   `label_name` (shortString): Default: ""
*   `maximum_jumps_(if_jumping_backwards)` (number): Default: 10

**Example:**
```json
{ "name": "cyberchef_conditional_jump", "arguments": { "input": "..." } }
```

---

#### Return (`cyberchef_return`)
End execution of operations at this point in the recipe.

**Example:**
```json
{ "name": "cyberchef_return", "arguments": { "input": "..." } }
```

---

#### Comment (`cyberchef_comment`)
Provides a place to write comments within the flow of the recipe. This operation has no computational effect.

**Arguments:**
*   `` (text): Default: ""

**Example:**
```json
{ "name": "cyberchef_comment", "arguments": { "input": "..." } }
```

---

