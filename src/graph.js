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

Graph.prototype.setup_visualisation = function() {
    var svg = this.target;

    var nodes = this.data.all_nodes();
    var edges = this.data.all_edges();

    var force = d3.layout.force()
        .nodes(nodes)
        .links(edges)
        .size([this.width, this.height]);

    // The initial render is done in a further timeout, to avoid
    // blocking for a long time.
    // This is based on: http://bl.ocks.org/mbostock/1667139
    setTimeout(function() {
      // Run the layout a fixed number of times.
      // The ideal number of times scales with graph complexity.
      // Of course, don't run too long—you'll hang the page!
      var n = 100;
      force.start();
      for (var i = n * n; i > 0; --i) force.tick();
      force.stop();

      svg.selectAll("line").data(edges)
        .enter().append("line")
          .attr("x1", function(d) { return d.source.x; })
          .attr("y1", function(d) { return d.source.y; })
          .attr("x2", function(d) { return d.target.x; })
          .attr("y2", function(d) { return d.target.y; });

      svg.selectAll("circle").data(nodes)
        .enter().append("circle")
          .attr("cx", function(d) { return d.x; })
          .attr("cy", function(d) { return d.y; })
          .attr("r", 4.5);
    }, 10);
}
