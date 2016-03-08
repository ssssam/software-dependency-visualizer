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


def lookup_node(identifier):
    '''Return a neo4jrestclient.Node instance, given a node identifier.

    This uses a neo4jrestclient filter, which boils down to a simple
    Cypher query underneath.

    '''
    try:
        node_number = int(identifier)
        return database.nodes.get(node_number)
    except ValueError:
        pass

    uri_lookup = neo4jrestclient.query.Q('uri', exact=identifier, limit=2)
    compact_uri_lookup = neo4jrestclient.query.Q('compact_uri',
                                                 exact=identifier, limit=2)

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


def node_name(node):
    '''Get a human-readable name for a node.

    The 'name' property is used if set, but it may not be set.

    '''
    if 'name' in node.properties:
        return node.properties['name']
    elif 'compact_uri' in node.properties:
        return node.properties['compact_uri']
    else:
        return node.uri


def encode_node(node, contents_graphjson=None):
    '''Represent as GraphJSON data, ready to send to client.'''

    return {
        '_id': node.id,
        'uri': node.properties['uri'],
        'caption': node_name(node),
        'contains': contents_graphjson or {},
    }


def encode_relationship(relationship):
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


class Presentation():
    '''Describes how to present a given node.

    Presentation involves a 2-dimensional traverse. The 'width' relations
    are intended to be represented as different nodes at the same level, e.g:

        o  --  o
          \
           \
            o

    The 'depth' relations are intended to be represented as a parent-child
    heirarchy, e.g:
         ______       _____
        /      \     /     \
        | o    |     |   o |
        |  \   |-----|     |
        |   o  |     | o   |
        \______/     \_____/

    '''

    def __init__(self, root_node,
                 width_relationships=['sw:requires', 'sw:produces'],
                 max_width=2,
                 depth_relationships=['sw:contains'],
                 max_depth=2):
        self.root_node = root_node

        self.width_relationships = width_relationships
        self.max_width = max_width
        self.depth_relationships = depth_relationships
        self.max_depth = max_depth

    def encode(self):
        return {
            'root_node': self.root_node.identifier,
            'width_relationships': self.width_relationships,
            'max_width': self.max_width,
            'depth_relationships': self.depth_relationships,
            'max_depth': self.max_depth
        }


@app.route('/graph/present/<root_node_identifier>')
def graph_present(root_node_identifier):
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

    def traverse_widthwise(start_node, config, depth=0):
        logging.debug("Traversing widthwise from '%s'" % node_name(start_node))

        paths = traverse_paths(start_node, stop=config.max_width,
                               types=config.width_relationships)

        nodes = set([start_node])
        edges = set()
        children = {
            start_node: find_children(start_node, config, depth=depth)
        }

        for path in paths:
            end_node = path.nodes[-1]

            if end_node not in nodes:
                nodes.add(end_node)
                edges.add(path.last_relationship)

                contents = find_children(end_node, config, depth=depth)
                children[end_node] = contents

        return nodes, edges, children

    def find_children(parent_node, config, depth=0):
        if depth >= config.max_depth:
            return {}

        logging.debug("Finding children of %s" % node_name(parent_node))

        child_nodes = traverse_nodes(parent_node, stop=1,
                                     direction=neo4jrestclient.client.Outgoing,
                                     types=config.depth_relationships)

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
                    traverse_widthwise(node, config, depth=depth+1)

                nodes.update(sibling_nodes)
                edges.update(sibling_edges)
                children.update(sibling_children)

        # We don't pass the config here, we only need to return it once per
        # query result.
        logging.debug("Presenting & returning %s, %s, %s", nodes, edges,
                      children)
        return encode_as_graphjson(nodes, edges, children)

    def encode_as_graphjson(node_list, edge_list, node_children, config=None):
        '''Structure traverse results as GraphJSON, suitable for clients.'''
        nodes_graphjson = []
        edges_graphjson = []

        for node in node_list:
            contents = node_children.get(node, {})
            info = encode_node(node, contents)
            if config and node == config.root_node:
                info['root'] = True
            nodes_graphjson.append(info)

        for edge in edge_list:
            edges_graphjson.append(encode_relationship(edge))

        result = {
            'nodes': nodes_graphjson,
            'edges': edges_graphjson,
        }

        if config:
            result['config'] = config.encode()

        return result

    root_node_identifier = urllib.parse.unquote(root_node_identifier)
    root_node = lookup_node(root_node_identifier)
    if not root_node:
        raise bottle.HTTPError(status=404)

    config = Presentation(root_node)

    nodes, edges, children = traverse_widthwise(root_node, config)
    return encode_as_graphjson(nodes, edges, children, config)


@app.route('/info/<node_identifier>')
def node_info(node_identifier):
    '''Return information about a resource, given its URI or compact URI.

    The info is returned as a Linked Data using the JSON-LD serialisation
    format.

    '''
    node_identifier = urllib.parse.unquote(node_identifier)
    node = lookup_node(node_identifier)

    # FIXME: this seems a bit of a dodgy way to get the URL for a route.
    scheme, netloc, path, query, _ = bottle.request.urlparts
    context_url = urllib.parse.urlunsplit(
        [scheme, netloc, app.get_url('/context.jsonld'), None, None])

    def node_link(node):
        query = {'focus':
                 urllib.parse.quote_plus(node.properties['compact_uri'])}
        query_string = urllib.parse.urlencode(query)
        return urllib.parse.urlunsplit([
            scheme, netloc, app.get_url('/browser/') + 'index.html',
            query_string, None])

    def relations_info(node, direction, type):
        '''Return a little info on some direct relations of this node.'''
        assert direction in ['incoming', 'outgoing']

        if direction == 'incoming':
            relationships = node.relationships.incoming(types=[type])
        else:
            relationships = node.relationships.outgoing(types=[type])

        infos = []
        for r in relationships:
            relation = r.end if direction=='outgoing' else r.start

            infos.append({
                '@id': relation.properties.get('uri'),
                'name': node_name(relation),
                'link': node_link(relation),
            })
        return infos or None

    return {
        '@context': context_url,

        # Note that this should be the URI of the *real* resource,
        # e.g. <https://git.gnome.org/browse/gtk+/tree/gtk/gtk.h?h=gtk-2-24>,
        # not a link to something in the software-dependency-visualiser
        # application.
        '@id': node.properties.get('uri'),

        'name': node_name(node),

        # FIXME: the *-by properties aren't defined anywhere. The main ontology
        # specifically avoids such 'unneeded' properties. I guess there or here
        # we should provide some 'supplemental' terms... or can it be done with
        # @reverse in the JSON-LD context??
        #
        # Also: we should be able to say 'requires' rather than 'sw:requires',
        # the import/neo4j script is getting that wrong right now.
        'requires': relations_info(node, 'outgoing', 'sw:requires'),
        'required_by': relations_info(node, 'incoming', 'sw:requires'),
        'produces': relations_info(node, 'outgoing', 'sw:produces'),
        'produced_by': relations_info(node, 'incoming', 'sw:produces'),
        'contains': relations_info(node, 'outgoing', 'sw:contains'),
        'contained_by': relations_info(node, 'incoming', 'sw:contains'),
    }


#logging.basicConfig(stream=sys.stdout, level=logging.DEBUG)

#node_number = graph_node_number("id:package/source/libgtk")
#print(graph_present(node_number))

app.run()
