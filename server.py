#!/usr/bin/env python3

# Software Dependency Explorer: PROTOTYPE
#
# This is the server-side component. It is pretty trivial, and right now exists
# only because database requests need to be served from the same location as
# the Javascript components of the frontend.
#
# It is written using the Python 'Bottle' web framework, in Python 3.
#
# Neo4j access uses the 'neo4jrestclient' Python module.
#
# Reimplementing this in Javascript using Node.js might make sense to allow
# code reuse between 'browser' and 'server' components.


import bottle
import neo4jrestclient.client
import neo4jrestclient.query
import yaml

import argparse
import json
import logging
import sys
import urllib.parse


# This is needed to be able to add Relationships to a set()
neo4jrestclient.client.Relationship.__hash__ = lambda self: hash(self.id)


DEFAULT_NEO4J = 'http://neo4j:insecure@localhost:7474/db/data'


def argument_parser():
    parser = argparse.ArgumentParser("Software dependency visualiser - server "
                                     "component")
    parser.add_argument('--neo4j', '-n', metavar='URL',
                        default=DEFAULT_NEO4J,
                        help="Neo4J database (default: %s)" % DEFAULT_NEO4J)

    return parser


args = argument_parser().parse_args()

app = bottle.Bottle()

database = neo4jrestclient.client.GraphDatabase(args.neo4j)


@app.route('/')
@app.route('/browser')
@app.route('/browser/')
def browser_redirect():
    '''Convenience redirect URLs to the main browser content.'''
    bottle.redirect('/browser/index.html')


@app.route('/browser/<path:path>')
def browser_content(path):
    '''Serve the browser content as static files.'''
    return bottle.static_file(path, root='browser/')


@app.route('/context.jsonld')
def jsonld_context():
    '''Serves the JSON-LD context that we use when describing resources.'''

    with open('data/context.jsonld.yaml') as f:
        context = yaml.load(f)
    bottle.response.content_type = 'application/ld+json'
    bottle.response.body = json.dumps(context, indent=4, sort_keys=True)
    return bottle.response


def lookup_node(uri):
    '''Return a neo4jrestclient.Node instance for given a URI or compact URI.

    This uses a neo4jrestclient filter, which boils down to a simple
    Cypher query underneath.

    '''
    uri_lookup = neo4jrestclient.query.Q('uri', exact=uri, limit=2)
    compact_uri_lookup = neo4jrestclient.query.Q('compact_uri', exact=uri,
                                                 limit=2)

    nodes = database.nodes.filter(compact_uri_lookup)
    if len(nodes) > 0:
        return nodes[0]
    else:
        nodes = database.nodes.filter(uri_lookup)
        if len(nodes) > 0:
            return nodes[0]
    return None


@app.route('/graph/node-number/<node_uri>')
def graph_node_number(node_uri):
    '''Return the node number, given a node's URI or compact URI.'''
    node_uri = urllib.parse.unquote(node_uri)
    node = lookup_node(node_uri)
    if node:
        return node.id
    else:
        raise bottle.HTTPError(status=404)


def repr_node(node):
    '''Represent a node as text. For use in debug logging and such.'''
    if 'name' in node.properties:
        return "'" + node.properties['name'] + "'"
    elif 'compact_uri' in node.properties:
        return node.properties['compact_uri']
    else:
        return repr(node)


def present_node(node, contents_graphjson=None):
    '''Represent as GraphJSON data, ready to send to client.'''

    return {
        '_id': node.id,
        'uri': node.properties['uri'],
        'caption': node.properties.get('name'),
        'contains': contents_graphjson or {},
    }


def present_relationship(relationship):
    '''Represent a relationship as GraphJSON data, ready to send to client.'''

    return {
        '_source': relationship.start.id,
        '_target': relationship.end.id,
        'type': relationship.type,
    }


def traverse_paths(start_node, stop=None, direction=neo4jrestclient.client.All,
                   types=None):
    '''Run a Neo4j traversal through the REST API, to find paths.

    The result is a list of Path objects. Any relationships in 'types' are
    followed, according to 'direction'.

    '''
    return start_node.traverse(
        returnable=neo4jrestclient.client.RETURN_ALL_BUT_START_NODE,
        returns=neo4jrestclient.client.PATH,
        stop=stop,
        # This is some weird neo4jrestclient API, sorry.
        types=[getattr(direction, name) for name in types]
    )


def traverse_nodes(start_node, stop=None, direction=neo4jrestclient.client.All,
                   types=None):
    '''Run a Neo4j traversal through the REST API, to find nodes.

    The result is a list of Node objects.

    '''
    return start_node.traverse(
        returnable=neo4jrestclient.client.RETURN_ALL_BUT_START_NODE,
        returns=neo4jrestclient.client.NODE,
        stop=stop,
        # This is some weird neo4jrestclient API, sorry.
        types=[getattr(direction, name) for name in types]
    )


@app.route('/graph/present/<root_node_number>')
def graph_present(root_node_number):
    '''Return siblings and children of a given graph node.

    This traverses the graph using the REST API of the Neo4j database.

    It's not possible to do this sort of traversal using the current version of
    the Cypher query language. You cannot define custom functions in Cypher
    2.3, and there are no other language features that would enable true
    recursion.

    It's actually not very convienient using the REST API either, because the
    existing traversals endpoint is designed for 1-dimensional traversal only.
    The ideal solution is probably to write a custom Neo4j plugin in Java: see
    <http://neo4j.com/docs/stable/server-plugins.html>. Or, it might work to
    write the queries we need in the Gremlin query language, and use this
    existing plugin: <https://github.com/neo4j-contrib/gremlin-plugin>.

    The return values are structed as GraphJSON data. This is slightly
    different to the format D3.js expects, but it seems better to me to use a
    standardised interchange format.

    GraphJSON is defined here: <https://github.com/GraphAlchemist/GraphJSON>
    (although it seems a little abandoned at time of writing). Note that
    the Node.js 'graph-json' package <https://www.npmjs.com/package/graph-json>
    is something else again.

    '''
    def traverse_widthwise(start_node, max_width=2, max_depth=2,
                           depth=0):
        logging.debug("Traversing widthwise from %s" % repr_node(start_node))

        paths = traverse_paths(start_node, stop=max_width,
                               types=['sw:produces', 'sw:requires'])

        nodes = set([start_node])
        edges = set()
        children = {
            start_node: find_children(start_node, max_width=max_width,
                                      max_depth=max_depth, depth=depth)
        }

        for path in paths:
            end_node = path.nodes[-1]

            if end_node not in nodes:
                nodes.add(end_node)
                edges.add(path.last_relationship)

                contents = find_children(end_node, max_width=max_width,
                                         max_depth=max_depth, depth=depth)
                children[end_node] = contents

        logging.debug("Returning %s, %s, %s", nodes, edges, contents)
        return nodes, edges, children

    def find_children(parent_node, max_width=2, max_depth=2, depth=0):
        if depth >= max_depth:
            return {}

        logging.debug("Finding children of %s" % repr_node(parent_node))

        child_nodes = traverse_nodes(parent_node, stop=1,
                                     direction=neo4jrestclient.client.Outgoing,
                                     types=['sw:contains'])

        # We now traverse from each child node in turn, to find all siblings
        # at this depth. This is pretty wasteful! It would be better to do
        # a single traverse operation that started from all child nodes at
        # once. That can't be done with the Neo4j REST API, though, we'd need
        # to write a Java plugin (or perhaps use the Gremlin query language).
        nodes = set()
        edges = set()
        children = {}
        for node in list(child_nodes):
            if node not in nodes:
                sibling_nodes, sibling_edges, sibling_children = \
                    traverse_widthwise(node, max_width=max_width,
                                       max_depth=max_depth, depth=depth+1)

                nodes.update(sibling_nodes)
                edges.update(sibling_edges)
                children.update(sibling_children)

        logging.debug("Presenting & returning %s, %s, %s", nodes, edges, children)
        return present(nodes, edges, children)

    def present(node_list, edge_list, node_children):
        nodes_graphjson = []
        edges_graphjson = []
        for node in node_list:
            contents = node_children.get(node, {})
            nodes_graphjson.append(present_node(node, contents))
        for edge in edge_list:
            edges_graphjson.append(present_relationship(edge))
        return {'nodes': nodes_graphjson, 'edges': edges_graphjson}

    root_node = database.nodes.get(root_node_number)
    nodes, edges, children = traverse_widthwise(root_node)
    return present(nodes, edges, children)


@app.route('/info/<node_identifier>')
def node_info(node_identifier):
    '''Return information about a resource, given its URI or compact URI.

    The info is returned as a Linked Data using the JSON-LD serialisation
    format.

    '''
    node_identifier = urllib.parse.unquote(node_identifier)
    try:
        node_number = int(node_identifier)
        node = database.nodes.get(node_number)
    except ValueError:
        node_uri = node_identifier
        node = lookup_node(node_uri)

    # FIXME: this seems a bit of a dodgy way to get the URL for a route.
    scheme, netloc, path, query, _ = bottle.request.urlparts
    context_url = urllib.parse.urlunsplit(
        [scheme, netloc, app.get_url('/context.jsonld'), None, None])

    def node_link(node):
        query = {'focus': urllib.parse.quote(node.properties['compact_uri'])}
        query_string = urllib.parse.urlencode(query)
        return urllib.parse.urlunsplit([
            scheme, netloc, app.get_url('/browser/') + 'index.html',
            query_string, None])

    def relation_info(node, direction, type):
        '''Return a little info on some direct relations of this node.'''
        assert direction in ['incoming', 'outgoing']

        if direction == 'incoming':
            relationships = node.relationships.incoming(types=[type])
        else:
            relationships = node.relationships.outgoing(types=[type])

        infos = [{
            '@id': r.end.properties.get('uri'),
            'name': r.end.properties.get('name'),
            'link': node_link(r.end),
        } for r in relationships]
        return infos

    return {
        '@context': context_url,

        # Note that this should be the URI of the *real* resource,
        # e.g. <https://git.gnome.org/browse/gtk+/tree/gtk/gtk.h?h=gtk-2-24>,
        # not a link to something in the software-dependency-visualiser
        # application.
        '@id': node.properties.get('uri'),

        'name': node.properties.get('name'),

        # FIXME: the *-by properties aren't defined anywhere. The main ontology
        # specifically avoids such 'unneeded' properties. I guess there or here
        # we should provide some 'supplemental' terms... or can it be done with
        # @reverse in the JSON-LD context??
        #
        # Also: we should be able to say 'requires' rather than 'sw:requires',
        # the import/neo4j script is getting that wrong right now.
        'requires': relation_info(node, 'outgoing', 'sw:requires'),
        'required-by': relation_info(node, 'incoming', 'sw:requires'),
        'produces': relation_info(node, 'outgoing', 'sw:produces'),
        'produced-by': relation_info(node, 'incoming', 'sw:produces'),
        'contains': relation_info(node, 'outgoing', 'sw:contains'),
        'contained-by': relation_info(node, 'incoming', 'sw:contains'),
    }



#logging.basicConfig(stream=sys.stdout, level=logging.DEBUG)

#node_number = graph_node_number("id:package/source/libgtk")
#print(graph_present(node_number))

app.run()
