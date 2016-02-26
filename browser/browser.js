/* Software dependency explorer PROTOTYPE */

/* "Browser" pane: the textual browser that describes a component and links it
 * to other components. Not sure if 'browser' is the ideal name.
 *
 * This code is for dynamically updating the Browser pane client-side. Maybe
 * this should all be done server-side instead. Or both. Not sure.
 */

'use strict';

// Constructor for Browser object.
function Browser(div_selector) {
    this.div_selector = div_selector;
};

Browser.prototype.show_component = function(node_identifier) {
    console.log("Requesting node: ", node_identifier);
    $.getJSON('/info/' + encodeURIComponent(node_identifier), function (node_info) {
        console.log("Displaying node: ", node_info);

        ko.applyBindings(node_info);
    });
};
