/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Denotes a Link between two Nodes in the context of a GraphObject
 */
type Link = {
    source: string
    target: string
    type?: string
}

/**
 * Denotes a Node in the context of a GraphObject
 */
type Node = {
    name: string
    // Takes the form <a>::<b>::<c> eg. 'AWS::Serverless::Function'
    type?: string
}

/**
 * Denotes a graph derived from a Cloudformation template.
 * Resources in the template are represented by Node objects.
 * Conntections between resources are represented by Link objects.
 */
type GraphObject = {
    nodes: Array<Node>
    links: Array<Link>
}

class Graph {
    /**
     * Stores the internal representation of the graph
     */
    private graph: GraphObject

    // Note: https://262.ecma-international.org/6.0/#sec-set-objects

    // Set objects must be implemented using either hash tables or other mechanisms that, on average,
    // provide access times that are sublinear on the number of elements in the collection

    /**
     * Stores which nodes exist in the graph
     * Node names are used as keys.
     * Exists to avoid iteration over the graph.nodes list to check for duplicates
     */
    private nodeSet: Set<string>

    /**
     * Stores which links exist in the graph
     * The concatenation of the Link source, target, and type strings are used as keys because
     * neither source, target, nor type properties are individually unique.
     * The combination of all three properties determines a unique Link.
     * Exists to avoid iteration over the graph.links list to check for duplicates
     */
    private linkSet: Set<string>

    constructor() {
        this.graph = { nodes: [], links: [] }
        this.nodeSet = new Set<string>()
        this.linkSet = new Set<string>()
    }

    /**
     * Creats a link pointing from nodeName1 to nodeName2. Does nothing if either node does not exist or if there already exists an indentical link.
     * @param sourceNodeName A string representing the name of the source node
     * @param destNodeName A string representing the name of the destination node
     * @param linkType A string representing the type of link
     */
    createLink(sourceNodeName: string, destNodeName: string, linkType?: string): void {
        const newLink: Link = {
            source: sourceNodeName,
            target: destNodeName,
            type: linkType,
        }

        // Using | as a delimiter between concatenated values to avoid accidental collisions for different links
        // | should not appear in any node name or link type.
        const newLinkIdentifier = `${sourceNodeName}|${destNodeName}|${linkType}`

        // If both source and destination nodes exist in the graph, and an identical link does not already exist, create a new link
        if (
            this.nodeSet.has(sourceNodeName) &&
            this.nodeSet.has(destNodeName) &&
            !this.linkSet.has(newLinkIdentifier)
        ) {
            // Register a link as existing in the graph
            this.linkSet.add(newLinkIdentifier)
            this.graph.links.push(newLink)
        }
    }

    /**
     * Initializes a node in the graph with the given name. If this node already exists in the graph, does nothing.
     * @param nodeName A string representing the name of the node to initialize in the graph
     * @param nodeType A string representing the type of the node to initialize in the graph
     */
    initNode(nodeName: string, nodeType?: string): void {
        if (!this.nodeSet.has(nodeName)) {
            // Register a node as existing in the graph
            this.nodeSet.add(nodeName)
            this.graph.nodes.push({ name: nodeName, type: nodeType })
        }
    }

    /**
     * Serializes the graph into an object.
     * @returns An object representing the graph
     */
    getObjectRepresentation(): GraphObject {
        return this.graph
    }
}

export { Graph, Node, Link, GraphObject }
