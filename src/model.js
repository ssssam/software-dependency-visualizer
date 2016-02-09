/* Software dependency explorer PROTOTYPE */

/* Data model.
 *
 * This basically stores a list of graph nodes and edges using generic Object
 * instances. These instances are used directly by the Graph object for the D3
 * layouts, which means D3 sets various properties on them.
 */

// Constructor for Model object.
function Model() {
    this.nodes = [];
    this.edges = [];
}

// Import data from a DotGraph object (useful for importing from GraphViz).
//
// Any existing data is overwritten.
//
// Example usage:
//
//    var dotgraph_ast = DotParser.parse(graphviz_text);
//    var dotgraph_graph = new DotGraph(ast);
//    dotgraph_graph.walk();
//    graph = new Model().import_from_dotgraph(dotgraph_graph);
//
Model.prototype.import_from_dotgraph = function(dotgraph_object) {
    this.nodes = dotgraph_object.nodes;
    console.log(dotgraph_object.nodes);

    this.all_nodes().forEach(function(node) {
        node.requires = [];
        node.required_by = [];
    });

    // DotGraph stores the edges as a dict, where key is the edge name,
    // and value is an array with one entry, an object with a .edge property
    // that contains an array. (Really).
    //
    // D3 expects an array of objects with .source and .target properties
    // that refer to indexes of the nodes_array, or the actual objects.
    //
    // For now the internal representation matches the bizarre format that D3
    // expects, but that should change.
    this.edges = [];
    Object.keys(dotgraph_object.edges).forEach(function(edge_name, index, _array) {
        var edge_data = dotgraph_object.edges[edge_name][0].edge

        var source = dotgraph_object.nodes[edge_data[0]];
        var target = dotgraph_object.nodes[edge_data[1]];

        var edge_object = {
            source: source,
            target: target
        };
        this.edges.push(edge_object);

        source.requires.push(target);
        target.required_by.push(source);
    }, this)
}

// Returns an array of all the nodes in the data model.
Model.prototype.all_nodes = function() {
    all_nodes = [];
    Object.keys(this.nodes).forEach(function(node_name, index, _array) {
        var node = this.nodes[node_name];
        node.label = node_name
        node.index = index
        all_nodes[index] = node;
    }, this);
    return all_nodes;
}

// Returns an array of all the edges in the data model.
// Each edge is represented as an Object with .source and .target properties
// that each point to a node object.
Model.prototype.all_edges = function() {
    return this.edges;
}

Model.prototype.node = function(name) {
    return this.nodes[name];
}
