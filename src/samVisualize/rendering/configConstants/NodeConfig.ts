/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Configuration constants regarding Node rendering
 */
export class NodeConfig {
    /**
     * Determines the radius of the Nodes in the graph.
     */
    public static readonly radius = 25

    /**
     * Determines the text size of the primary label on Nodes.
     */
    public static readonly primaryTextSize = 16

    /**
     * Determines the text size of the secondary label on Nodes.
     */
    public static readonly secondaryTextSize = 12

    /**
     * Determines how far below a Node the primary text sits.
     * Higher value means lower placement.
     */
    public static readonly primaryLabelYOffset = 45

    /**
     * Determines how far below a Node the secondary text sits.
     * Higher value means lower placement.
     */
    public static readonly secondaryLabelYOffset = 60

    /**
     * Determines the relative growth of a node on mouse over.
     */
    public static readonly mouseOverNodeSizeMultiplier = 1.5

    /**
     * Determines the time it takes for a node to grow on mouse over (in milliseconds).
     */
    public static readonly mouseOverNodeGrowthTime = 500
}
