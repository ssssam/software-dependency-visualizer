#!/usr/bin/env python3

# Software Dependency Explorer: PROTOTYPE
#
# This is the server-side component. It is pretty trivial, and right now exists
# only because database requests need to be served from the same location as
# the Javascript components of the frontend.
#
# It is written using the Python 'Bottle' web framework, in Python 3.
#
# Neo4j access uses 'py2neo'.
#
# Reimplementing this in Javascript using Node.js might make sense to allow
# code reuse between 'browser' and 'server' components.


import bottle
import py2neo

import argparse


def argument_parser():
    parser = argparse.ArgumentParser("Software dependency visualiser - server "
                                     "component")
    return parser


@bottle.route('/browser')
@bottle.route('/browser/')
def browser_redirect():
    '''Convenience redirect URLs to the main browser content.'''
    bottle.redirect('/browser/index.html')


@bottle.route('/browser/<path:path>')
def browser_content(path):
    '''Serve the browser content as static files.'''
    return bottle.static_file(path, root='browser/')


def main():
    bottle.run()


main()
