/* Software dependency explorer PROTOTYPE */
/* Graph visualisation */

"use strict";

// Constructor for Graph object.
function Graph(model, svg_element_selector) {
    this.data = model
    this.target = d3.select(svg_element_selector);
    this.width = $("#graph-visualisation").width();
    this.height = $("#graph-visualisation").height();

    this.layout = null;

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

Graph.prototype.setup_visualisation = function(focus_node_name, layout, max_requires, max_required_by) {
    if (this.layout != null) {
        if ('stop' in this.layout)
            this.layout.stop();
        if ('on' in this.layout)
            this.layout.on('tick', null);
    }

    var svg = this.target;

    var nodes = this.data.node_with_dependencies(focus_node_name, max_requires, max_required_by);

    /* With vector graphics, we create the shapes once, and then use style
     * changes and translations to response to UI events. Changing the focused
     * component triggers a page reload.
     */
    function create_svg_entities(nodes_array, edges) {
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
    function force_tick() {
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

    /* FIXME: this can obviously be done with less copy+paste between the different
     * layout types.
     */
    if (layout == "force") {
        // It amazes me that Object.values() is only now being developed... i'm
        // avoiding it here so that this code might work in MS Internet Explorer.
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

        var edges = this.data.all_edges().filter(function(element) {
            return (element.source.label in nodes) && (element.target.label in nodes);
        });

        var force = d3.layout.force()
            .nodes(nodes_array)
            .links(edges)
            .size([this.width, this.height])
            .start();

        svg.selectAll("line").remove();
        svg.selectAll("circle").remove();
        create_svg_entities(nodes_array, edges);
        force.on("tick", force_tick);

        this.layout = force;
    } else {
        if (max_requires > 0 && max_required_by > 0) {
            // FIXME: this constraint should be reflected in the UI.
            console.warn(
                    "Cannot show both 'requires' and 'required-by' when "
                    + layout + " layout is used.");
        }

        var children_fn;
        if (max_requires > 0) {
            children_fn = function(node) { return node.requires; }
        } else if (max_required_by > 0) {
            children_fn = function(node) { return node.required_by; }
        } else {
            children_fn = function() { return []; };
        }

        // We're operating on actual Component objects owned by the Model, so
        // you couldn't have two different Graph objects for the same Model.
        // That can be fixed if we ever need it, for now this is more efficient.
        for (var node_name in nodes) {
            nodes[node_name].children = children_fn(nodes[node_name]);
        }

        var cluster = d3.layout.cluster()
            .size([this.width, this.height])

        var nodes_array = cluster.nodes(nodes[focus_node_name]),
            links = [];//cluster.links(nodes_array);

        svg.selectAll("line").remove();
        svg.selectAll("circle").remove();
        create_svg_entities(nodes_array, links);

        svg.selectAll("circle.node").attr(
            "transform", function(d) {
                return "translate(" + d.x + "," + d.y + ")"; });

        this.layout = cluster;
    }

    console.log("Showed " + layout + " layout, size " + this.width + "x" + this.height);
}
