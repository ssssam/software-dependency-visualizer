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
    var node = this.data.node(name);

    // FIXME: need to deal with an invalid node name being passed
    // by showing some kind of helpful error

    ko.applyBindings(node);
};
