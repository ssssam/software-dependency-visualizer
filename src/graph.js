/* Software dependency explorer PROTOTYPE */
/* Graph visualisation */

"use strict";

// Constructor for Graph object.
function Graph(svg_element_selector) {
    this.target = d3.select(svg_element_selector);

    if (this.target.empty()) {
        throw new Error("Graph(): invalid svg_element_selector: " + svg_element_selector);
    }

    this.nodes = [];
    this.edges = [];
};

// Show a big text in the middle of the SVG.
Graph.prototype.show_loading_text = function(text) {
    this.loading_text = this.target.append("text")
        // It's a shame we mix jQuery and D3 here, but the D3 equivalent
        // of getting width+height returns strings with 'px' appended.
        .attr("x", $("#graph-visualisation").width() / 2)
        .attr("y", $("#graph-visualisation").height() / 2)
        .attr("dy", ".35em")
        .style("text-anchor", "middle")
        .text(text);
};

Graph.prototype.hide_loading_text = function() {
    this.loading_text.remove();
}

// Load graph data from a DotGraph object (useful for importing from GraphViz).
//
// Example usage:
//
//    var dotgraph_ast = DotParser.parse(graphviz_text);
//    var dotgraph_graph = new DotGraph(ast);
//    dotgraph_graph.walk();
//    graph = new Graph().load_from_dotgraph(dotgraph_graph);
//
Graph.prototype.load_from_dotgraph = function(dotgraph_object) {
    /* This is horrible!! We must do it some better way. */

    // DotGraph stores the nodes as an object with each node as an attributes,
    // while D3 expects an array of objects. We will the objects from
    // DotGraph, D3 will add various extra properties to them.
    this.nodes = []
    Object.keys(dotgraph_object.nodes).forEach(function(node_name, index, _array) {
        var node = dotgraph_object.nodes[node_name];
        node.label = node_name
        node.index = index
        this.nodes[index] = node;
    }, this)

    // DotGraph stores the edges as a dict, where key is the edge name,
    // and value is an array with one entry, an object with a .edge property
    // that contains an array. (Really).
    //
    // D3 expects an array of objects with .source and .target properties
    // that refer to indexes of the nodes_array, or the actual objects.
    this.edges = [];
    Object.keys(dotgraph_object.edges).forEach(function(edge_name, index, _array) {
        var edge_data = dotgraph_object.edges[edge_name][0].edge
        var edge_object = {
            source: dotgraph_object.nodes[edge_data[0]],
            target: dotgraph_object.nodes[edge_data[1]]
        };
        this.edges.push(edge_object);
    }, this)
}
