# BroShow

Browser extension that records a browser tab and saves as mp4.

## Development Paradigm

This project follows the **functional programming** paradigm. Use @nw-functional-software-crafter for implementation.

- Pure functions for data transformation (mp4 muxing, filename generation)
- Effect boundaries at browser API edges (tabCapture, downloads, messaging)
- Algebraic types for state (`RecordingState`) and messages (`Message`)
- Composition pipelines for the recording flow

## Mutation Testing Strategy

This project uses **per-feature** mutation testing. Runs after refactoring during each delivery, scoped to modified files. Kill rate gate: >= 80%.
