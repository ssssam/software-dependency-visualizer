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

    // These functions sync the SVG elements visualising the data with the
    // Javascript objects that representing the data.

    // Note that each SVG element is 'bound' to a specific Javascript object,
    // using the D3-specific __data__ attribute. These bindings should persist
    // while the user changes what components are shown, so that any components
    // still in view are also still in the same place. This is known as "object
    // constancy".

    function bind_circles(nodes_array) {
        var node_key_fn = function(d) { return d.label };

        var circles = svg.selectAll("circle");
        var circles_update = circles.data(nodes_array, node_key_fn);

        // Remove circles whose data is no longer part of the visible model.
        circles_update.exit().remove();

        // Create new circles for any objects that don't yet have a
        // corresponding SVG element.
        //
        // All circles have position 0. Their location is actually set using
        // the 'translate' attribute. (FIXME: why?)
        circles_update.enter().append("circle")
            .attr("cx", 0)
            .attr("cy", 0)
            .attr("r", 4.5)
            .attr("class", "node");
    }

    function bind_lines(edges) {
        // FIXME: Right now the 'edges' objects exist just for D3 to arrange
        // them, which is defeating the point of D3. We should have a
        // Relationship object type that encodes the actual data of a
        // 'requires' or a 'required-by' relationship (or any other type).

        var lines = svg.selectAll("line");
        var lines_update = lines.data(edges);
        console.log(edges);

        // Remove lines which are no longer part of the visible data.
        lines_update.exit().remove();

        // Create new lines for relationships that are now visible.
        lines_update.enter().append("line")
            .attr("x1", function(d) { return d.source.x; })
            .attr("y1", function(d) { return d.source.y; })
            .attr("x2", function(d) { return d.target.x; })
            .attr("y2", function(d) { return d.target.y; })
            .attr("class", "link");
    }

    // Update the positions of SVG elements from the .x and .y attributes
    // on the Javascript objects that are bound to them. This can be used
    // as a 'tick' callback for animated layouts.
    function update_positions() {
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

        bind_circles(nodes_array);
        bind_lines(edges);
        force.on("tick", update_positions);

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
        // FIXME: this isn't right, needs to have .source and .target attrs
            links = cluster.links(nodes_array);

        bind_lines(nodes_array);
        bind_circles(links);
        update_positions();

        this.layout = cluster;
    }

    console.log("Showed " + layout + " layout, size " + this.width + "x" + this.height);
}
