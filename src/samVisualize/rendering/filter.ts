/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { GraphObject, Node, Link } from '../graphGeneration/graph'
/**
 * Filters a GraphObject to only include primary nodes, and links between primary nodes
 * @param graphData The GraphObject to filter
 * @param primaryResources A Set of node names to include as primary
 * @returns A new GraphObject with only primary nodes and links between primary nodes
 */
export function filterPrimaryOnly(graphData: GraphObject, primaryResources: Set<string>): GraphObject {
    // Tracks primary Nodes, which allows link selection to be done in O(N)
    const primaryNodes = new Set<string>()

    const primaryNodeList: Array<Node> = []

    // Select primary nodes
    for (const node of graphData.nodes) {
        if (node.type && primaryResources.has(node.type)) {
            primaryNodes.add(node.name)
            primaryNodeList.push(node)
        }
    }
    // Select links between primary nodes
    const primaryLinkList: Array<Link> = []
    for (const link of graphData.links) {
        if (primaryNodes.has(link.source) && primaryNodes.has(link.target)) {
            primaryLinkList.push(link)
        }
    }
    return { nodes: primaryNodeList, links: primaryLinkList }
}
