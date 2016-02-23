#!/usr/bin/env python3

# setup.py for software-dependency-visualiser prototype.
#
# This uses a tool called PBR, which is a more declarative way of
# describing Python build dependencies. See setup.cfg for the settings,
# and requirements.txt for the requirements list.

from setuptools import setup

setup(
    setup_requires=['pbr'],
    pbr=True,
)
