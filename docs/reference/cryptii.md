# cryptii - Web-Based Modular Encoding and Encryption

## Overview

### Project Information

| Property | Value |
|----------|-------|
| **Name** | cryptii |
| **Version** | 4.0.11 |
| **Type** | Web Application |
| **Description** | A web app for modular conversion, encoding, and encryption, all performed directly in your browser with no server interaction |
| **Author** | Fränz Friederes |
| **License** | MIT License (Copyright 2024 Fränz Friederes) |
| **Repository** | https://github.com/cryptii/cryptii |
| **Website** | https://cryptii.com |
| **Node Version** | As specified in `.nvmrc` |

### Key Features

1. **Client-Side Processing**: All operations performed directly in the browser with no server interaction
2. **Modular Architecture**: Brick-based system allowing flexible chaining of encoders and viewers
3. **Visual Interface**: Interactive UI for building encoding/decoding pipelines
4. **Bidirectional Processing**: Changes propagate through the pipeline in both directions
5. **Persistent Pipes**: Save and restore encoding chains via URLs
6. **40+ Operations**: Comprehensive library of ciphers, encodings, and transformations

### Philosophy

- **Privacy First**: All operations are client-side, ensuring data never leaves the user's browser
- **Backwards Compatibility**: Brick setting interfaces are carefully designed to maintain compatibility with saved pipes
- **User-Friendly**: Visual, interactive approach to data transformation
- **Educational**: Excellent tool for learning about cryptography and encoding

## Architecture

### Core Concepts

#### 1. Bricks

Bricks are the fundamental building blocks of cryptii. There are two main types:

**Encoders**
- Process content by encoding or decoding using specific methods and settings
- Support bidirectional operation (encode/decode)
- Can be configured with various settings
- Examples: Base64, Caesar Cipher, AES Encryption

**Viewers**
- Allow users to view, edit, and interact with content
- Support multiple formats (text, bytes, punched tape)
- Serve as input/output points in the pipeline
- Examples: Text Viewer, Bytes Viewer, Punched Tape Viewer

#### 2. Pipes

Pipes are containers that arrange Bricks in sequence:
- Content flows through Bricks sequentially
- Changes propagate bidirectionally through the Pipe
- Can be serialized and shared via URLs
- Support adding, removing, duplicating, and hiding Bricks

#### 3. Chains

Chains are data containers that:
- Store content as UTF-8 text, Unicode code points, or binary bytes
- Automatically convert between text and binary representations
- Enable seamless integration when transitioning between content types
- Lazy evaluation for performance

#### 4. Forms and Fields

Each Brick has a settings form containing:
- Configuration fields (text, boolean, numeric, etc.)
- Validation rules
- Randomization support for applicable settings
- Event-driven updates that trigger pipeline re-processing

### File Structure

```
cryptii/
├── src/
│   ├── App.js                  # Main application
│   ├── Brick.js                # Abstract brick base class
│   ├── Encoder.js              # Encoder brick base class
│   ├── Viewer.js               # Viewer brick base class
│   ├── Pipe.js                 # Pipeline orchestration (34KB)
│   ├── Chain.js                # Data container with auto-conversion
│   ├── Form.js                 # Settings form management
│   ├── Field.js                # Individual setting fields
│   ├── Factory.js              # Brick factory pattern
│   ├── Encoder/                # 37 encoder implementations (~8K LOC)
│   │   ├── A1Z26.js
│   │   ├── ADFGXCipher.js
│   │   ├── AffineCipher.js
│   │   ├── AlphabeticalSubstitution.js
│   │   ├── Ascii85.js
│   │   ├── BaconCipher.js
│   │   ├── Base32.js
│   │   ├── Base64.js
│   │   ├── BaudotCode.js
│   │   ├── BifidCipher.js
│   │   ├── BitwiseOperation.js
│   │   ├── BlockCipher.js      # Includes AES
│   │   ├── Bootstring.js
│   │   ├── CaesarCipher.js
│   │   ├── CaseTransform.js
│   │   ├── CharacterBlock.js
│   │   ├── Enigma.js           # 13 Enigma models (30KB)
│   │   ├── Hash.js
│   │   ├── HMAC.js
│   │   ├── Integer.js
│   │   ├── MorseCode.js
│   │   ├── NihilistCipher.js
│   │   ├── NumeralSystem.js
│   │   ├── PolybiusSquare.js
│   │   ├── Punycode.js
│   │   ├── RailFenceCipher.js
│   │   ├── RC4.js
│   │   ├── Replace.js
│   │   ├── Reverse.js
│   │   ├── ROT13.js
│   │   ├── SpellingAlphabet.js
│   │   ├── TapCode.js
│   │   ├── TrifidCipher.js
│   │   ├── UnicodeCodePoints.js
│   │   ├── URL.js
│   │   └── VigenereCipher.js
│   ├── Viewer/                 # 3 viewer implementations
│   │   ├── Bytes.js
│   │   ├── PunchedTape.js
│   │   └── Text.js
│   ├── View/                   # UI components
│   ├── Field/                  # Field types
│   ├── Error/                  # Error handling
│   └── Factory/                # Factory implementations
├── style/                      # SCSS stylesheets
├── test/                       # Mocha tests
├── assets/                     # Static assets
├── index.html                  # Single-page app entry
├── vite.config.js              # Vite build config
└── package.json                # Project metadata
```

### Technical Stack

| Component | Technology |
|-----------|------------|
| **Language** | JavaScript (ES6+ modules) |
| **Build Tool** | Vite 5.4.8 |
| **Styling** | SCSS with normalize-scss 8.0.0 |
| **Testing** | Mocha 10.7.3 |
| **Code Style** | JavaScript Standard Style 17.1.2 |
| **Module System** | ES Modules (`"type": "module"`) |

### Development Workflow

```bash
# Install dependencies
npm install

# Development server with hot reload
npm run dev
# or
npm start

# Production build
npm run build

# Preview production build
npm run preview

# Run tests
npm test  # Runs 'standard' linter + mocha tests
```

### Code Architecture Patterns

#### Brick Implementation Example (A1Z26)

```javascript
import CharacterBlockEncoder from './CharacterBlock.js'

const meta = {
  name: 'a1z26',
  title: 'A1Z26',
  category: 'Ciphers',
  type: 'encoder'
}

export default class A1Z26Encoder extends CharacterBlockEncoder {
  static getMeta () {
    return meta
  }

  constructor () {
    super()
    this.addSettings([
      {
        name: 'alphabet',
        type: 'text',
        value: 'abcdefghijklmnopqrstuvwxyz',
        uniqueChars: true,
        minLength: 2
      },
      {
        name: 'caseSensitivity',
        type: 'boolean',
        value: false,
        randomizable: false
      }
    ])
  }

  performCharEncodeToBlock (codePoint, index, content) {
    // Encoding logic: character -> number
  }

  performBlockDecodeToChar (block, index, blocks, content) {
    // Decoding logic: number -> character
  }
}
```

#### Key Design Patterns

1. **Inheritance Hierarchy**: Brick → Encoder → SpecificEncoder (e.g., CharacterBlockEncoder → A1Z26Encoder)
2. **Factory Pattern**: BrickFactory creates instances dynamically by name
3. **Observer Pattern**: EventManager for cross-component communication
4. **Fluent Interface**: Method chaining for configuration (`.setTitle().setHidden()`)
5. **Serialization**: All bricks can serialize/deserialize their state for URL sharing

## Brick Library

### Complete Operation List

| Name | Category | Description |
|------|----------|-------------|
| `a1z26` | Ciphers | Number to letter encoder (A1Z26) |
| `adfgx-cipher` | Polybius square | ADFGX cipher |
| `affine-cipher` | Ciphers | Affine Cipher |
| `alphabetical-substitution` | Ciphers | Alphabetical substitution |
| `ascii85` | Encoding | Ascii85 / Base85 incl. variant Z85 |
| `bacon-cipher` | Ciphers | Bacon's cipher |
| `base32` | Encoding | Base32 incl. variants base32hex, z-base-32, etc. |
| `base64` | Encoding | Base64 incl. variants base64url, etc. |
| `baudot-code` | Encoding | Baudot code |
| `bifid-cipher` | Polybius square | Bifid cipher |
| `bitwise-operation` | Transform | Bitwise operations (NOT, AND, OR, XOR, etc.) |
| `block-cipher` | Modern cryptography | Block ciphers including AES |
| `bootstring` | Encoding | Bootstring (RFC 3492) |
| `bytes` | View | Viewing and editing bytes |
| `caesar-cipher` | Ciphers | Caesar cipher |
| `case-transform` | Transform | Upper case, lower case, title case, etc. |
| `enigma` | Ciphers | Enigma machine with 13 models |
| `hash` | Modern cryptography | Message digest / hash functions |
| `hmac` | Modern cryptography | Hash-based message authentication code |
| `integer` | Encoding | Translates between bytes and integers |
| `morse-code` | Alphabets | Morse code (English) |
| `nihilist-cipher` | Polybius square | Nihilist cipher |
| `numeral-system` | Transform | Translates numerals between systems (Roman, etc.) |
| `punched-tape` | View | Punched tape visualization |
| `polybius-square` | Polybius square | Polybius square |
| `punycode` | Encoding | Punycode (RFC 3492) |
| `rail-fence-cipher` | Ciphers | Rail fence cipher |
| `rc4` | Modern cryptography | RC4 incl. RC4-drop |
| `replace` | Transform | Find and replace text |
| `reverse` | Transform | Reverse bytes, characters, or lines |
| `rot13` | Ciphers | ROT13 incl. variants ROT5, ROT18, ROT47 |
| `spelling-alphabet` | Alphabets | NATO phonetic and other spelling alphabets |
| `tap-code` | Polybius square | Tap code |
| `text` | View | Viewing and editing plain text |
| `trifid-cipher` | Polybius square | Trifid cipher |
| `unicode-code-points` | Encoding | Encoding to Unicode code points |
| `url-encoding` | Encoding | URL encoding / Percent-encoding |
| `vigenere-cipher` | Ciphers | Vigenère cipher incl. Beaufort cipher variants |

### Operations by Category

#### Ciphers (12 operations)
- A1Z26, Affine, Alphabetical Substitution, Bacon, Caesar, Enigma, Rail Fence, ROT13, Vigenère

#### Polybius Square (5 operations)
- ADFGX, Bifid, Nihilist, Polybius Square, Tap Code, Trifid

#### Modern Cryptography (4 operations)
- Block Cipher (AES), Hash, HMAC, RC4

#### Encoding (10 operations)
- ASCII85, Base32, Base64, Baudot Code, Bootstring, Integer, Punycode, Unicode Code Points, URL Encoding

#### Alphabets (2 operations)
- Morse Code, Spelling Alphabet

#### Transform (5 operations)
- Bitwise Operation, Case Transform, Numeral System, Replace, Reverse

#### View (3 operations)
- Bytes, Punched Tape, Text

## Integration Guidance for CyberChef-MCP

### Operations Unique to cryptii (Not in CyberChef)

These operations could potentially be added to CyberChef to expand its capabilities:

#### High-Priority Additions

1. **Tap Code** (`TapCode.js`)
   - Prison communication cipher using taps
   - Maps letters to Polybius square coordinates
   - Configurable tap, group, and letter marks
   - Educational and CTF value

2. **ADFGX Cipher** (`ADFGXCipher.js`)
   - WWI German cipher
   - Combines Polybius square with columnar transposition
   - Historical significance

3. **Spelling Alphabet** (`SpellingAlphabet.js`)
   - NATO phonetic alphabet and variants
   - Useful for radio communication simulation
   - Multiple alphabet variants supported

4. **Punched Tape Viewer**
   - Visual representation of data as punched tape
   - Historical computing context
   - Educational visualization

#### Medium-Priority Additions

5. **Baudot Code** (`BaudotCode.js`)
   - 5-bit teleprinter code
   - Historical telecommunications
   - Multiple variants (ITA1, ITA2, MTK-2)

6. **Bootstring** (`Bootstring.js`)
   - RFC 3492 encoding algorithm
   - Foundation for Punycode
   - More configurable than Punycode alone

7. **Numeral System Translator** (`NumeralSystem.js`)
   - Converts between different numeral systems
   - Includes Roman numerals
   - Educational value

#### Lower-Priority (Overlapping Functionality)

8. **Character Block Encoder Base Class**
   - Useful abstraction for block-based ciphers
   - Could simplify implementation of similar operations

### UI/UX Patterns Worth Adopting

1. **Bidirectional Pipeline**
   - Changes propagate both forward and backward through the pipeline
   - Users can edit at any stage and see effects throughout
   - CyberChef currently processes in one direction only

2. **Visual Pipeline Builder**
   - Drag-and-drop interface for building encoding chains
   - Visual representation of data flow
   - Interactive brick configuration

3. **URL-Based Pipe Sharing**
   - Entire pipeline serialized into shareable URL
   - Easy collaboration and tutorial creation
   - No need for export/import files

4. **Brick Visibility Toggle**
   - Hide/show intermediate steps without removing them
   - Cleaner interface for complex pipelines
   - Preserve configuration while decluttering UI

5. **In-Place Editing**
   - Edit content at any stage in the pipeline
   - Immediate propagation of changes
   - More intuitive than CyberChef's input/output model

6. **Randomization Support**
   - "Randomize" button for applicable operations
   - Useful for testing and demonstration
   - Could be added to CyberChef operations

### Architectural Insights

#### Strengths to Consider

1. **Modular Brick System**
   - Clean separation of concerns
   - Easy to add new operations
   - Self-contained configuration and validation

2. **Chain Abstraction**
   - Automatic conversion between text/binary/code points
   - Reduces implementation complexity for operations
   - Could simplify CyberChef's Dish class

3. **Form-Based Settings**
   - Declarative configuration
   - Built-in validation
   - Standardized UI rendering

4. **Factory Pattern**
   - Dynamic brick creation by name
   - Enables URL deserialization
   - Cleaner than switch/case registration

#### Potential Improvements for CyberChef-MCP

1. **Tool Categorization**
   - cryptii uses clear categories (Ciphers, Encoding, Modern Cryptography)
   - CyberChef has 300+ operations that could benefit from similar grouping
   - MCP tools list could include category metadata

2. **Bidirectional Operations**
   - Many cryptii operations support automatic encode/decode detection
   - CyberChef operations could expose both directions as separate tools
   - Example: `cyberchef_base64_encode` and `cyberchef_base64_decode`

3. **Visual Pipeline Representation**
   - cryptii's pipeline UI makes complex chains understandable
   - CyberChef-MCP could return intermediate results for visualization
   - AI assistants could describe the pipeline structure

## Use Cases

### Educational Applications

1. **Learning Cryptography**
   - Visual representation helps understand cipher mechanics
   - Step-by-step transformation visible at each stage
   - Historical ciphers (Enigma, Vigenère) with detailed configuration

2. **Teaching Encoding**
   - See how text becomes Base64, then hex, then binary
   - Understand character encoding (UTF-8, ASCII)
   - Demonstrate data representation concepts

3. **Computer Science Fundamentals**
   - Bitwise operations with visual feedback
   - Integer representation (endianness, signed/unsigned)
   - Unicode code points and character sets

### Quick Encoding/Decoding

1. **URL Encoding/Decoding**
   - Quick percent-encoding for web development
   - No need for command-line tools

2. **Base64 Operations**
   - Encode/decode without leaving the browser
   - Useful for data URIs, JWT inspection

3. **Text Transformations**
   - Case conversion
   - Character reversal
   - Find and replace

### Visual Data Transformation Chains

1. **Complex Pipelines**
   - Chain multiple operations: encrypt → encode → transform
   - Save and share via URL
   - Useful for documentation and tutorials

2. **CTF Challenges**
   - Build decoding pipelines for multi-layer challenges
   - Test different cipher configurations
   - Experiment with unknown encodings

3. **Data Format Conversion**
   - Transform between different representations
   - Visualize intermediate steps
   - Debug encoding issues

### Comparison with CyberChef

| Feature | cryptii | CyberChef |
|---------|---------|-----------|
| **Operations** | ~40 | 300+ |
| **Processing** | Bidirectional | Unidirectional |
| **UI** | Pipeline builder | Recipe builder |
| **Sharing** | URL-based | Export JSON |
| **Server Dependency** | None | None (client-side) |
| **Complexity** | Simpler, focused | Comprehensive |
| **Target Audience** | General users, education | Security professionals, analysts |
| **Extensibility** | Moderate | High (plugin system) |

### When to Use cryptii vs CyberChef

**Use cryptii when:**
- Teaching cryptography or encoding concepts
- Need visual, interactive pipeline building
- Working with classic ciphers (Enigma, Vigenère)
- Want to share pipelines via URL
- Prefer simpler, cleaner UI

**Use CyberChef when:**
- Need specialized operations (network tools, compression, forensics)
- Working with binary data formats
- Require advanced features (regex, parsing)
- Need comprehensive operation library
- Working on CTF or security analysis

**Use CyberChef-MCP when:**
- Integrating with AI assistants
- Automating encoding/decoding workflows
- Need programmatic access to operations
- Building tools that leverage CyberChef capabilities

## Design Principles

From the CONTRIBUTING.md:

1. **Long-term Compatibility**
   - Carefully design brick setting interfaces
   - Maintain backwards compatibility
   - Saved pipes should restore correctly across versions

2. **Client-Side First**
   - All operations should be client-side if possible
   - No reliance on external servers
   - Privacy and security by design

3. **Code Quality**
   - JavaScript Standard Style compliance
   - Comprehensive testing with Mocha
   - Capitalized comments
   - Present tense, imperative mood for commits

4. **User Experience**
   - Intuitive visual interface
   - Clear operation categorization
   - Helpful error messages
   - Debug information available (Ctrl+I)

## Development Standards

### Git Commit Messages

1. Capitalize the subject line
2. Use present tense ("Add feature" not "Added feature")
3. Use imperative mood ("Move cursor to..." not "Moves cursor to...")
4. No period at end of subject line
5. Limit first line to 72 characters or less

### JavaScript Style

- Follows [JavaScript Standard Style](https://standardjs.com/)
- ES6+ module syntax
- Class-based architecture
- Fluent interfaces for configuration

### Testing

- Mocha test framework
- Run with `npm test` (includes linting)
- Tests required for pull requests

## Resources

### Documentation

- **Main README**: Comprehensive project overview
- **Contributing Guide**: Development standards and workflow
- **Code of Conduct**: Community guidelines
- **Security Policy**: Vulnerability reporting

### Community

- **Issues**: https://github.com/cryptii/cryptii/issues
- **Pull Requests**: Follow template and standards
- **Email**: hello@cryptii.com

### Live Application

- **Production**: https://cryptii.com
- **Latest Release**: https://github.com/cryptii/cryptii/releases/latest
- **All Releases**: https://github.com/cryptii/cryptii/releases

## Summary

cryptii represents an excellent complementary tool to CyberChef, with a focus on educational value, visual interaction, and classic cryptography. While CyberChef excels in breadth and advanced capabilities, cryptii provides a more accessible, visual approach to encoding and encryption.

For CyberChef-MCP development, cryptii offers:
- Several unique operations worth porting (Tap Code, ADFGX, Spelling Alphabet)
- UI/UX patterns for potential future enhancements
- Architectural patterns (Brick system, Chain abstraction)
- Educational use cases that could inform documentation and examples

The modular, client-side architecture aligns well with CyberChef's philosophy, and both projects demonstrate the power of JavaScript-based cryptographic tools that respect user privacy by operating entirely in the browser.
