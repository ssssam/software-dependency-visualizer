/* Software dependency explorer PROTOTYPE */

/* "Browser" pane: the textual browser that describes a component and links it
 * to other components. Not sure if 'browser' is the ideal name.
 *
 * This code is for dynamically updating the Browser pane client-side. Maybe
 * this should all be done server-side instead. Or both. Not sure.
 */

"use strict";

// Constructor for Browser object.
function Browser(model, div_selector) {
    this.data = model
    this.div_selector = div_selector;
};

Browser.prototype.show_component = function(name) {
    $(this.div_selector + " #name").text(name);

    var node = this.data.node(name);

    // FIXME: use CSS styles, don't hardcode the colours here
    if (node == undefined)
        $(this.div_selector + " #name").css('color', 'red');
    else
        $(this.div_selector + " #name").css('color', 'black');

    $(this.div_selector + " #requires").empty();
    console.log(node.requires);
    if (node.requires.length == 0) {
        $(this.div_selector + " #requires").html("<i>none</i>");
    } else {
        // FIXME: I need to learn how to do this stuff properly with jQuery...
        $(this.div_selector + " #requires").html('<ul id="requires-list"></ul>');
        node.requires.forEach(function(dep) {
            console.log(dep);
            $(this.div_selector + " #requires #requires-list").append("<li>" + dep.label + "</li>");
        }, this);
    };
};
