# Contributing

> **Note:** This is the CyberChef-MCP fork which provides an MCP (Model Context Protocol) server interface to CyberChef operations. For the original web UI project, see [GCHQ/CyberChef](https://github.com/gchq/CyberChef).

Take a look through the [Wiki pages](https://github.com/gchq/CyberChef/wiki) for guides on [compiling CyberChef](https://github.com/gchq/CyberChef/wiki/Getting-started) and [adding new operations](https://github.com/gchq/CyberChef/wiki/Adding-a-new-operation).

There are lots of opportunities to contribute to CyberChef-MCP. If you want ideas, take a look at any [Issues](https://github.com/doublegate/CyberChef-MCP/issues) tagged with '[help wanted](https://github.com/doublegate/CyberChef-MCP/labels/help%20wanted)'.

Before your contributions can be accepted, you must:

 - Push your changes to your fork.
 - Submit a pull request to [doublegate/CyberChef-MCP](https://github.com/doublegate/CyberChef-MCP).


## Coding conventions

* Indentation: Each block should consist of 4 spaces
* Object/namespace identifiers: CamelCase
* Function/variable names: camelCase
* Constants: UNDERSCORE_UPPER_CASE
* Source code encoding: UTF-8 (without BOM)
* All source files must end with a newline
* Line endings: UNIX style (\n)


## Design Principles (MCP Server Focus)

This fork focuses on the MCP server implementation (`src/node/mcp-server.mjs`) which exposes CyberChef operations as AI assistant tools. The following principles apply:

1. **MCP Protocol Compliance**: All tools must follow the Model Context Protocol specification for proper integration with AI assistants.
2. **Minimal Dependencies**: Keep the Node.js API lightweight and avoid unnecessary dependencies. The server should start quickly and have a small footprint.
3. **Comprehensive Testing**: All MCP tools must have unit tests. The current suite has 343 tests with 78.93% line coverage.
4. **Documentation**: Each tool must have clear descriptions and parameter schemas that AI assistants can understand.
5. **Use Vanilla JS**: Prefer standard JavaScript features to reduce dependencies, following the original CyberChef philosophy.

With these principles in mind, any changes or additions to CyberChef-MCP should keep it:

 - MCP-compliant
 - Efficient
 - Well-tested
 - As small as possible
