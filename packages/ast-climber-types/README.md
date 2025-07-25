# ast-climber-types

TypeScript type definitions for [ast-climber](https://github.com/CRJFisher/ast-climber) - a code analysis library for building scope graphs and call graphs.

## Overview

This package provides only TypeScript type definitions from ast-climber with zero runtime code. It's designed for environments where bundle size is critical (like webviews) or when you only need type definitions without the implementation.

## Installation

```bash
npm install ast-climber-types
# or
yarn add ast-climber-types
# or
pnpm add ast-climber-types
```

## Usage

### In a webview or lightweight environment

```typescript
import type { CallGraph, Def, CallGraphNode, SimpleRange } from 'ast-climber-types';

// Use types for proper type safety without runtime dependency
function processCallGraph(graph: CallGraph): void {
  graph.nodes.forEach((node: CallGraphNode) => {
    console.log(`Processing node: ${node.symbol}`);
  });
}

// Type-safe message passing
interface GraphMessage {
  type: 'graph-update';
  data: CallGraph;
}
```

### In an extension or main process

You can use either the full ast-climber package or just the types:

```typescript
// Option 1: Use full ast-climber (includes implementation)
import { CallGraph, get_call_graph } from 'ast-climber';

// Option 2: Just types (if only needed for type annotations)
import type { CallGraph, Def, Ref } from 'ast-climber-types';
```

## Available Types

### Core Graph Types

- `CallGraph` - Complete call graph structure
- `CallGraphNode` - Node in the call graph
- `CallGraphEdge` - Edge between nodes in the call graph
- `CallGraphOptions` - Options for call graph generation

### Definition and Reference Types

- `Def` - Definition node with metadata
- `Ref` - Reference node
- `Import` - Import statement node
- `Scope` - Scope node
- `Call` - Function/method call representation

### Utility Types

- `Point` - Position in a file (row, column)
- `SimpleRange` - Range between two points
- `Edit` - Document edit representation
- `LanguageConfig` - Language-specific configuration

### Enums

- `Scoping` - Scoping rules (Local, Hoisted, Global)

### Type Unions

- `Node` - Union of Def | Ref | Import | Scope
- `Edge` - Union of all edge types

## Version Compatibility

This package version matches the ast-climber version it's generated from. For example, `ast-climber-types@0.5.0` contains types from `ast-climber@0.5.0`.

## License

MIT - Same as ast-climber