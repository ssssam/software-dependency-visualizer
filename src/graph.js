/* Software dependency explorer PROTOTYPE */
/* Graph visualisation */

"use strict";

// Constructor for Graph object.
function Graph(model, svg_element_selector) {
    this.data = model
    this.target = d3.select(svg_element_selector);
    this.width = $("#graph-visualisation").width();
    this.height = $("#graph-visualisation").height();

    if (this.target.empty()) {
        throw new Error("Graph(): invalid svg_element_selector: " + svg_element_selector);
    }
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

Graph.prototype.setup_visualisation = function(focus_node, max_requires, max_required_by) {
    var svg = this.target;


    var nodes = this.data.node_with_dependencies(focus_node, max_requires, max_required_by);

    // It amazes me that Object.values() is only now being developed... i'm
    // avoiding it here for that reason.
    var nodes_array = [];
    Object.keys(nodes).forEach(function(node_name) {
        nodes_array.push(nodes[node_name]);
    });

    // Start all nodes in the centre; this makes the initial
    // stabilisation a lot less weird and distracting.
    nodes_array.forEach(function(node) {
        if (node.x == undefined)
          node.x = this.width / 2;
        if (node.y == undefined)
          node.y = this.height / 2;
    }, this);

    // FIXME: edges needs reworking now that we only graph a subset of the nodes...
    var edges = this.data.all_edges().filter(function(element) {
        //console.log(element.source, element.target);
        return (element.source.label in nodes) && (element.target.label in nodes);
    });

    console.log(edges);

    var force = d3.layout.force()
        .nodes(nodes_array)
        .links(edges)
        .size([this.width, this.height])
        .start();

    /* With vector graphics, we create the shapes once, and then use style
     * changes and translations to response to UI events. Changing the focused
     * component triggers a page reload.
     */
    function create_svg_entities() {
        svg.selectAll("line").data(edges)
          .enter().append("line")
            .attr("x1", function(d) { return d.source.x; })
            .attr("y1", function(d) { return d.source.y; })
            .attr("x2", function(d) { return d.target.x; })
            .attr("y2", function(d) { return d.target.y; })
            .attr("class", "link");

        svg.selectAll("circle").data(nodes_array)
          .enter().append("circle")
            .attr("cx", 0)
            .attr("cy", 0)
            .attr("r", 4.5)
            .attr("class", "node");
    }

    // Update the positions of links and circles following the
    // D3 force-directed layout.
    function tick() {
        svg.selectAll("line.link")
            .attr("x1", function(d) { return d.source.x; })
            .attr("y1", function(d) { return d.source.y; })
            .attr("x2", function(d) { return d.target.x; })
            .attr("y2", function(d) { return d.target.y; })

        // Yes, we really construct a property value using string
        // concatenation, every tick... this approach is taken from the D3
        // examples.
        svg.selectAll("circle.node").attr(
            "transform", function(d) {
                return "translate(" + d.x + "," + d.y + ")"; });
    }

    svg.selectAll("line").remove();
    svg.selectAll("circle").remove();
    create_svg_entities();
    force.on("tick", tick);
}
