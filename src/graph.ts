import { SyntaxNode, Range } from 'tree-sitter';

// Basic Types from the document

export interface Point {
  row: number;
  column: number;
}

export interface SimpleRange {
  start: Point;
  end: Point;
}

export enum Scoping {
  Local,
  Hoisted,
  Global,
}

// Node types for the graph

interface BaseNode {
  id: number;
  range: SimpleRange;
}

export interface FunctionMetadata {
  is_async?: boolean;
  is_test?: boolean;         // Detected test function
  is_private?: boolean;       // Starts with _ in Python
  complexity?: number;        // Cyclomatic complexity
  line_count: number;         // Size of function
  parameter_names?: string[]; // For signature display
  has_decorator?: boolean;    // Python decorators
  class_name?: string;        // For methods, the containing class
}

export interface Def extends BaseNode {
  kind: 'definition';
  name: string;
  symbol_kind: string; // e.g., 'function', 'class', 'variable'
  file_path: string;  // The file containing this definition
  symbol_id: string;  // Unique identifier in format: module_path#name
  metadata?: FunctionMetadata; // Metadata for function definitions
  enclosing_range?: SimpleRange;  // Full body range including definition
  signature?: string;             // Full signature with parameters
  docstring?: string;             // Documentation comment if available
}

export interface Ref extends BaseNode {
  kind: 'reference';
  name: string;
  symbol_kind?: string; // Optional namespace/symbol type
}

export interface Import extends BaseNode {
  kind: 'import';
  name: string;          // Local name (as used in this file)
  source_name?: string;  // Original export name (if renamed)
  source_module?: string; // Module path (e.g., './utils')
}

export interface Scope extends BaseNode {
  kind: 'scope';
}

export type Node = Def | Ref | Import | Scope;

/**
 * Represents a function call relationship in the codebase.
 */
export interface FunctionCall {
  caller_def: Def;           // The function making the call
  called_def: Def;           // The function being called  
  call_location: Point;      // Where in the caller the call happens
  is_method_call: boolean;   // true for self.method() or this.method()
}

/**
 * Represents an import with its resolved definition.
 * Used to map import statements to the actual definitions they reference.
 */
export interface ImportInfo {
  imported_function: Def;    // The actual function definition in the source file
  import_statement: Import;  // The import node in the importing file
  local_name: string;        // Name used in the importing file (may differ from source)
}

// Edge types to connect the nodes

interface BaseEdge {
  source_id: number;
  target_id: number;
}

export interface DefToScope extends BaseEdge {
  kind: 'def_to_scope';
}

export interface RefToDef extends BaseEdge {
  kind: 'ref_to_def';
}

export interface ScopeToScope extends BaseEdge {
  kind: 'scope_to_scope';
}

export interface ImportToScope extends BaseEdge {
  kind: 'import_to_scope';
}

export interface RefToImport extends BaseEdge {
  kind: 'ref_to_import';
}

export type Edge = DefToScope | RefToDef | ScopeToScope | ImportToScope | RefToImport;

// The main graph structure

export class ScopeGraph {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private next_node_id = 0;
  private root_id: number;

  constructor(root_node: SyntaxNode, lang_id: string) {
    // A new graph is created with a root scope that spans the entire file.
    const root_scope: Scope = {
      id: this.get_next_node_id(),
      kind: 'scope',
      range: {
        start: { row: root_node.startPosition.row, column: root_node.startPosition.column },
        end: { row: root_node.endPosition.row, column: root_node.endPosition.column },
      }
    };
    this.root_id = root_scope.id;
    this.nodes.push(root_scope);
  }

  // Method stubs based on the deep dive document
  insert_local_def(def: Def) {
    const parent_scope_id = this.find_containing_scope(def.range);
    this.nodes.push(def);
    this.edges.push({ kind: 'def_to_scope', source_id: def.id, target_id: parent_scope_id });
  }

  insert_hoisted_def(def: Def) {
    // Hoisted definitions are inserted into the parent scope of the defining scope
    const defining_scope_id = this.find_containing_scope(def.range);
    
    // Find the parent scope
    const parent_edge = this.edges.find(
      e => e.kind === 'scope_to_scope' && e.source_id === defining_scope_id
    );
    
    // If there's a parent scope, insert there; otherwise insert in the defining scope
    const target_scope_id = parent_edge ? parent_edge.target_id : defining_scope_id;
    
    this.nodes.push(def);
    this.edges.push({ kind: 'def_to_scope', source_id: def.id, target_id: target_scope_id });
  }

  insert_global_def(def: Def) {
    this.nodes.push(def);
    this.edges.push({ kind: 'def_to_scope', source_id: def.id, target_id: this.root_id });
  }

  insert_local_scope(scope: Scope) {
    const parent_scope_id = this.find_containing_scope(scope.range);
    this.nodes.push(scope);
    this.edges.push({ kind: 'scope_to_scope', source_id: scope.id, target_id: parent_scope_id });
  }

  insert_local_import(imp: Import) {
    const parent_scope_id = this.find_containing_scope(imp.range);
    this.nodes.push(imp);
    this.edges.push({ kind: 'import_to_scope', source_id: imp.id, target_id: parent_scope_id });
  }

  insert_ref(ref: Ref) {
    const possible_defs: number[] = [];
    const possible_imports: number[] = [];
    
    const local_scope_id = this.find_containing_scope(ref.range);
    
    // Walk up the scope chain from the reference's scope to the root
    for (const scope_id of this.get_scope_stack(local_scope_id)) {
      // Find definitions in this scope
      const defs_in_scope = this.get_defs_in_scope(scope_id);
      for (const def_id of defs_in_scope) {
        const def = this.nodes.find(n => n.id === def_id) as Def;
        if (def && def.name === ref.name) {
          // Check if symbols are compatible (if both have symbol kinds)
          if (!ref.symbol_kind || !def.symbol_kind || ref.symbol_kind === def.symbol_kind) {
            possible_defs.push(def_id);
          }
        }
      }
      
      // Find imports in this scope
      const imports_in_scope = this.get_imports_in_scope(scope_id);
      for (const import_id of imports_in_scope) {
        const imp = this.nodes.find(n => n.id === import_id) as Import;
        if (imp && imp.name === ref.name) {
          possible_imports.push(import_id);
        }
      }
    }
    
    // Add the reference node and create edges to found definitions/imports
    if (possible_defs.length > 0 || possible_imports.length > 0) {
      this.nodes.push(ref);
      
      for (const def_id of possible_defs) {
        this.edges.push({ kind: 'ref_to_def', source_id: ref.id, target_id: def_id });
      }
      
      for (const import_id of possible_imports) {
        this.edges.push({ kind: 'ref_to_import', source_id: ref.id, target_id: import_id });
      }
    }
  }

  get_next_node_id(): number {
    return this.next_node_id++;
  }

  private find_containing_scope(range: SimpleRange): number {
    let best_scope_id = this.root_id;
    let best_scope_size = Infinity;

    for (const node of this.nodes) {
      if (node.kind === 'scope') {
        const scope_range = node.range;
        // Check if the scope contains the given range
        const start_before = scope_range.start.row < range.start.row || 
          (scope_range.start.row === range.start.row && scope_range.start.column <= range.start.column);
        const end_after = scope_range.end.row > range.end.row || 
          (scope_range.end.row === range.end.row && scope_range.end.column >= range.end.column);
        
        if (start_before && end_after) {
          const scope_size = (scope_range.end.row - scope_range.start.row) * 1000 + (scope_range.end.column - scope_range.start.column);
          if (scope_size < best_scope_size) {
            best_scope_id = node.id;
            best_scope_size = scope_size;
          }
        }
      }
    }
    return best_scope_id;
  }

  node_to_simple_range(node: SyntaxNode): SimpleRange {
    return {
      start: { row: node.startPosition.row, column: node.startPosition.column },
      end: { row: node.endPosition.row, column: node.endPosition.column },
    };
  }

  // Helper method to get the scope stack from a starting scope to the root
  private get_scope_stack(start_scope_id: number): number[] {
    const stack: number[] = [];
    let current_id = start_scope_id;
    
    while (current_id !== undefined) {
      stack.push(current_id);
      
      // Find the parent scope
      const parent_edge = this.edges.find(
        e => e.kind === 'scope_to_scope' && e.source_id === current_id
      );
      
      if (parent_edge) {
        current_id = parent_edge.target_id;
      } else {
        break;
      }
    }
    
    return stack;
  }

  // Get all definitions in a specific scope
  private get_defs_in_scope(scope_id: number): number[] {
    return this.edges
      .filter(e => e.kind === 'def_to_scope' && e.target_id === scope_id)
      .map(e => e.source_id);
  }

  // Get all imports in a specific scope
  private get_imports_in_scope(scope_id: number): number[] {
    return this.edges
      .filter(e => e.kind === 'import_to_scope' && e.target_id === scope_id)
      .map(e => e.source_id);
  }

  // Get all nodes of a specific type
  getNodes<T extends Node>(kind: T['kind']): T[] {
    return this.nodes.filter(n => n.kind === kind) as T[];
  }

  // Get edges of a specific type
  getEdges<T extends Edge>(kind: T['kind']): T[] {
    return this.edges.filter(e => e.kind === kind) as T[];
  }

  // Find definitions for a reference
  getDefsForRef(ref_id: number): Def[] {
    const def_ids = this.edges
      .filter(e => e.kind === 'ref_to_def' && e.source_id === ref_id)
      .map(e => e.target_id);
    
    return def_ids
      .map(id => this.nodes.find(n => n.id === id))
      .filter(n => n && n.kind === 'definition') as Def[];
  }

  // Find imports for a reference
  getImportsForRef(ref_id: number): Import[] {
    const import_ids = this.edges
      .filter(e => e.kind === 'ref_to_import' && e.source_id === ref_id)
      .map(e => e.target_id);
    
    return import_ids
      .map(id => this.nodes.find(n => n.id === id))
      .filter(n => n && n.kind === 'import') as Import[];
  }

  // Find all references to a definition
  getRefsForDef(def_id: number): Ref[] {
    const ref_ids = this.edges
      .filter(e => e.kind === 'ref_to_def' && e.target_id === def_id)
      .map(e => e.source_id);
    
    return ref_ids
      .map(id => this.nodes.find(n => n.id === id))
      .filter(n => n && n.kind === 'reference') as Ref[];
  }

  // Find node at a specific position
  findNodeAtPosition(position: Point): Node | null {
    // Find the smallest node that contains the position
    let bestNode: Node | null = null;
    let bestSize = Infinity;
    
    for (const node of this.nodes) {
      const range = node.range;
      
      // Check if position is within this node's range
      if (this.positionInRange(position, range)) {
        // Calculate size (prefer smaller nodes)
        const size = (range.end.row - range.start.row) * 10000 + 
                    (range.end.column - range.start.column);
        
        if (size < bestSize) {
          bestNode = node;
          bestSize = size;
        }
      }
    }
    
    return bestNode;
  }

  // Check if a position is within a range
  private positionInRange(pos: Point, range: SimpleRange): boolean {
    // Check if position is after start
    if (pos.row < range.start.row || 
        (pos.row === range.start.row && pos.column < range.start.column)) {
      return false;
    }
    
    // Check if position is before end
    if (pos.row > range.end.row || 
        (pos.row === range.end.row && pos.column > range.end.column)) {
      return false;
    }
    
    return true;
  }

  // Get all definitions in this graph
  getAllDefs(): Def[] {
    return this.getNodes<Def>('definition');
  }

  // Get all imports in this graph
  getAllImports(): Import[] {
    return this.getNodes<Import>('import');
  }

  // Find a definition by name in the root scope (for exports)
  findExportedDef(name: string): Def | null {
    const rootDefs = this.get_defs_in_scope(this.root_id);
    
    for (const def_id of rootDefs) {
      const def = this.nodes.find(n => n.id === def_id) as Def;
      if (def && def.name === name) {
        return def;
      }
    }
    
    return null;
  }

  // Debug method to print graph structure
  debug_print() {
    console.log('\n=== Graph Structure ===');
    console.log('Nodes:');
    for (const node of this.nodes) {
      console.log(`  ${node.id}: ${node.kind} ${node.kind !== 'scope' ? (node as any).name : ''} at ${node.range.start.row}:${node.range.start.column}`);
    }
    console.log('\nEdges:');
    for (const edge of this.edges) {
      console.log(`  ${edge.source_id} -> ${edge.target_id} (${edge.kind})`);
    }
  }
}

// Call Graph Types

/**
 * Represents a function or method call in the codebase.
 * Used by the call graph API to represent outgoing calls from a definition.
 */
export interface Call {
  symbol: string;                                    // Symbol being called
  range: SimpleRange;                                // Location of the call
  kind: "function" | "method" | "constructor";      // Type of call
  resolved_definition?: Def;                         // The definition being called (if resolved)
}

/**
 * Options for configuring call graph generation.
 */
export interface CallGraphOptions {
  include_external?: boolean;                        // Include calls to external libraries
  max_depth?: number;                                // Limit recursion depth
  file_filter?: (path: string) => boolean;          // Filter which files to analyze
}

/**
 * Represents a node in the call graph.
 * Each node corresponds to a callable definition (function/method).
 */
export interface CallGraphNode {
  symbol: string;                                    // Unique symbol identifier
  definition: Def;                                   // The underlying definition
  calls: Call[];                                     // Outgoing calls from this node
  called_by: string[];                               // Incoming calls (symbol names)
}

/**
 * Represents an edge in the call graph.
 * Each edge represents a call relationship between two nodes.
 */
export interface CallGraphEdge {
  from: string;                                      // Caller symbol
  to: string;                                        // Callee symbol
  location: SimpleRange;                             // Where the call occurs
}

/**
 * The complete call graph structure.
 * Contains all nodes and edges representing the call relationships in the codebase.
 */
export interface CallGraph {
  nodes: Map<string, CallGraphNode>;                 // All nodes indexed by symbol
  edges: CallGraphEdge[];                            // All edges (call relationships)
  top_level_nodes: string[];                         // Symbols not called by others
} 