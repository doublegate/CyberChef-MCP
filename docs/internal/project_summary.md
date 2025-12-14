# CyberChef MCP Server: Project Summary

## Overview
This project aims to transform the existing CyberChef application—the "Cyber Swiss Army Knife"—into a **Model Context Protocol (MCP) Server**. This transformation will allow AI assistants (like Claude, Gemini, etc.) to directly utilize CyberChef's extensive library of data manipulation operations (encryption, encoding, compression, forensics) as native tools within their conversation context.

## Goals
1.  **Expose Functionality:** Make all CyberChef operations available as executable MCP tools.
2.  **Containerization:** specific Docker support for running the MCP server portion of the application.
3.  **Usability:** Ensure tools are well-documented and arguments are properly mapped so the AI agent can use them effectively without guessing.

## Key Features
-   **`cyberchef_bake` Tool:** A powerful omni-tool that allows constructing complex recipes (chains of operations) just like the Web UI.
-   **Granular Tools:** (Optional/Configurable) Exposing individual operations like `cyberchef_to_base64`, `cyberchef_aes_decrypt` as standalone tools.
-   **Search & Discovery:** Tools to help the agent find the right operation for a specific task.

## Value Proposition
By integrating CyberChef with MCP, we bridge the gap between natural language intent ("Decode this base64 string then gunzip it") and deterministic, verifiable execution. The AI doesn't need to hallucinate the output of an algorithm; it delegates the computation to the battle-tested CyberChef library.
