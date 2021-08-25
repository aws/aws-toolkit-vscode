/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RenderedLinkTypes, TemplateLinkTypes } from '../samVisualizeTypes'

/**
 * Denotes a Link between two Nodes in the context of a GraphObject
 */
export type Link = {
    source: string
    target: string
    type: string
}

/**
 * Denotes a Node in the context of a GraphObject
 */
export type Node = {
    name: string
    // Takes the form <a>::<b>::<c> eg. 'AWS::Serverless::Function'
    type: string
}

/**
 * Denotes a graph derived from a Cloudformation template.
 * Resources in the template are represented by Node objects.
 * Conntections between resources are represented by Link objects.
 */
export type GraphObject = {
    nodes: Array<Node>
    links: Array<Link>
}

export class Graph {
    /**
     * Stores the internal representation of the graph
     */
    private readonly graph: GraphObject

    // Note: https://262.ecma-international.org/6.0/#sec-set-objects

    // Set objects must be implemented using either hash tables or other mechanisms that, on average,
    // provide access times that are sublinear on the number of elements in the collection

    /**
     * Stores which nodes exist in the graph
     *
     * Node names are used as keys.
     *
     * Exists to avoid iteration over the graph.nodes list to check for duplicates
     */
    private readonly nodeSet: Set<string>

    /**
     * Stores which links exist in the graph.
     *
     * Uses a Map instead of a Set to store the type of link,
     * to allow DependsOn links between two nodes to be replaced by an Intrinsic Function link between the same nodes.
     *
     * The concatenation of the Link source and target strings are used as keys because
     * neither source nor target properties are individually unique.
     * The combination of both properties determines a unique Link.
     *
     * Exists to avoid iteration over the graph.links list to check for duplicates
     */
    private readonly linkMap: Map<string, string | undefined>

    constructor() {
        this.graph = { nodes: [], links: [] }
        this.nodeSet = new Set<string>()
        this.linkMap = new Map<string, string | undefined>()
    }

    /**
     * Creats a link pointing from sourceNode to targetNode.
     * Will replace an existing link between sourceNode and destNode only if the exisiting link
     * has a 'DependsOn' type and the new link has a 'Intrinsic Function' type.
     * Otherwise, does nothing if link already exists.
     * @param sourceNodeName A string representing the name of the source node
     * @param targetNodeName A string representing the name of the destination node
     * @param linkType A string representing the type of link
     */
    public createLink(sourceNodeName: string, targetNodeName: string, linkType: string): void {
        const generalizedLinkType = [
            TemplateLinkTypes.GetAtt.toString(),
            TemplateLinkTypes.Ref.toString(),
            TemplateLinkTypes.Sub.toString(),
        ].includes(linkType)
            ? RenderedLinkTypes.IntrinsicFunction
            : RenderedLinkTypes.DependsOn

        const newLink: Link = {
            source: sourceNodeName,
            target: targetNodeName,
            type: generalizedLinkType,
        }

        // Using | as a delimiter between concatenated values to avoid accidental collisions for different links
        // | should not appear in any node name or link type.
        const newLinkIdentifier = `${sourceNodeName}|${targetNodeName}`

        // Both nodes must exist in the graph to consider modifying / adding links
        if (this.nodeSet.has(sourceNodeName) && this.nodeSet.has(targetNodeName)) {
            // If there is no existing link, add one.
            if (!this.linkMap.has(newLinkIdentifier)) {
                this.linkMap.set(newLinkIdentifier, generalizedLinkType)
                this.graph.links.push(newLink)
            }
            // ONLY replace an existing link between two nodes if the exisiting link is of type DependsOn and the new link is of type Intrinsic Function.
            // DependsOn is implied by Intrinsic Function
            // We check if the exisiting link type was DependsOn instead of just checking if the new link type is IntrinsicFunction
            // to avoid iteration over `graph.links` unless the type is actually being replaced.
            else if (
                this.linkMap.get(newLinkIdentifier) === RenderedLinkTypes.DependsOn &&
                generalizedLinkType === RenderedLinkTypes.IntrinsicFunction
            ) {
                // Register a link as existing in the graph
                this.linkMap.set(newLinkIdentifier, RenderedLinkTypes.IntrinsicFunction)

                // Find the link whose type we replace.
                // This iteration should occur very rarely.
                for (const link of this.graph.links) {
                    if (link.source === sourceNodeName && link.target === targetNodeName) {
                        link.type = RenderedLinkTypes.IntrinsicFunction
                    }
                }
            }
        }
    }

    /**
     * Initializes a node in the graph with the given name. If this node already exists in the graph, does nothing.
     * @param nodeName A string representing the name of the node to initialize in the graph
     * @param nodeType A string representing the type of the node to initialize in the graph
     */
    public initNode(nodeName: string, nodeType: string): void {
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
    public getObjectRepresentation(): GraphObject {
        return this.graph
    }
}
