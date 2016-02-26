/* Software dependency explorer PROTOTYPE */
/* Graph visualisation */

'use strict';

var STYLE = {
    node_radius: 20
}

// Constructor for Graph object.
function Graph(svg_element_selector) {
    var svg = d3.select(svg_element_selector)

    if (svg.empty()) {
        throw new Error("Graph(): invalid svg_element_selector: " + svg_element_selector);
    }

    // Set up a bounding box using an SVG group, to avoid nodes at the edges
    // being clipped. Using CSS margin/padding doesn't avoid clipping.
    var width = $(svg_element_selector).width();
    var height = $(svg_element_selector).height();
    var margin = STYLE['node_radius'] + 2;
    this.target = svg.append('g').
        attr('transform', function(d) {
            return 'translate(' + margin + ',' + margin + ')'; })
    this.width = width - margin * 2;
    this.height = height - margin * 2;
};

Graph.prototype.show_component = function(node_identifier) {
    this.show_loading_text("Loading " + node_identifier);

    console.log("Requesting presentation graph for: ", node_identifier);
    var this_ = this;
    d3.json('/graph/present/' + encodeURIComponent(node_identifier),
            function(error, data_graphjson) {
        if (error) return console.warn(error);
        console.log(data_graphjson);

        this_.hide_loading_text();
        this_.update(data_graphjson);
    });
};

// These functions sync the SVG elements visualising the data with the
// Javascript objects that representing the data.

// Note that each SVG element is 'bound' to a specific Javascript object,
// using the D3-specific __data__ attribute. These bindings should persist
// while the user changes what components are shown, so that any components
// still in view are also still in the same place. This is known as "object
// constancy".
Graph.prototype.bind_circles = function(svg, nodes_array) {
    var node_key_fn = function(d) { return d._id };

    var circles = svg.selectAll('.node');
    var circles_update = circles.data(nodes_array, node_key_fn);

    // Remove circles whose data is no longer part of the visible model.
    circles_update.exit().remove();

    // Create new circles for any objects that don't yet have a
    // corresponding SVG element.
    //
    // All circles have position 0. Their location is actually set using
    // the 'translate' attribute. (FIXME: why?)
    var nodes_selection = circles_update.enter().append('g')
        .attr('class', 'node');

    nodes_selection.append('circle')
        .attr('r', STYLE.node_radius)

    nodes_selection.append('text')
        .text(function(d) { return d.caption; })
        .attr('dx', STYLE.node_radius)
}

Graph.prototype.bind_lines = function(svg, edges) {
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
// as a 'tick' callback for animated layouts, or called once for static
// layouts.
Graph.prototype.update_positions = function(svg) {
    svg.selectAll("line.link")
        .attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        .attr("x2", function(d) { return d.target.x; })
        .attr("y2", function(d) { return d.target.y; })

    // Yes, we really construct a property value using string
    // concatenation, every tick... this approach is taken from the D3
    // examples.
    svg.selectAll(".node").attr(
        "transform", function(d) {
            return "translate(" + d.x + "," + d.y + ")"; });
}

// Bind a new set of data to the visual display.
Graph.prototype.update = function(data_graphjson) {
    var svg = this.target;

    // FIXME: the GraphJSON format isn't actually a very convenient input for
    // the 'tree' layout... but it IS convenient for binding to shapes.
    var nodes = data_graphjson['nodes'];
    var edges = data_graphjson['edges'];
    var root_node = $.grep(nodes, function (node) { return node.root == true })[0];

    var nodes_by_id = {};
    for (var i=0, len=nodes.length; i<len; i++) {
        nodes_by_id[nodes[i]._id] = nodes[i];
    }

    var tree_layout = d3.layout.tree();
    tree_layout.size([this.width, this.height / 2.0]);

    tree_layout.children(function(d) {
        var children = [];
        for (var i=0, len=edges.length; i<len; i++) {
            if (edges[i].type == 'sw:requires' && edges[i]._source == d._id)
                children.push(nodes_by_id[edges[i]._target])
        }
        return children;
    })

    console.log(root_node);
    tree_layout.nodes(root_node)

    this.bind_circles(svg, nodes);
    this.bind_lines(svg, tree_layout.links(nodes));
    this.update_positions(svg);
};

Graph.prototype.old = function(data_graphjson) {
    // Stop the layout
    if (this.layout != null) {
        if ('stop' in this.layout)
            this.layout.stop();
        if ('on' in this.layout)
            this.layout.on('tick', null);
    }

    var svg = this.target;

    var nodes = this.data.node_with_dependencies(focus_node_name, max_requires, max_required_by);

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
};
