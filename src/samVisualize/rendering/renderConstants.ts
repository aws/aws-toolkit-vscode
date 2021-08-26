/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configuration constants regarding Node rendering
 */

/**
 * Determines the radius of the Nodes in the graph.
 */
export const radius = 25

/**
 * Determines the text size of the primary label on Nodes.
 */
export const primaryTextSize = 16

/**
 * Determines the text size of the secondary label on Nodes.
 */
export const secondaryTextSize = 12

/**
 * Determines how far below a Node the primary text sits.
 * Higher value means lower placement.
 */
export const primaryLabelYOffset = 48

/**
 * Determines how far below a Node the secondary text sits.
 * Higher value means lower placement.
 */
export const secondaryLabelYOffset = 65

/**
 * Determines the relative growth of a node on mouse over.
 */
export const mouseOverNodeSizeMultiplier = 1.5

/**
 * Determines the time it takes for a node to grow on mouse over (in milliseconds).
 */
export const mouseOverNodeGrowthTime = 500

/**
 * Configuration constants regarding Link rendering
 */

/**
 * Determines the viewbox for the arrowheads at the end of the Link
 */
export const arrowheadViewbox = '0 -5 10 10'

/**
 * Determines size (width and height) of viewport for which the arrowhead markers are fitted.
 */
export const arrowheadSize = 10

/**
 * Defines the path which draws the arrowhead shape.
 */
export const arrowheadShape = 'M 0,-5 L 10,0 L 0,5'

/**
 * Determines the width of default links
 */
export const linkStrokeWidth = 2

/**
 * Specifies the length of a dash in a dashed dependsOn link
 */
export const dependsOnLinkDash = 10

/**
 * Specifies the length of a dash in a dashed dependsOn link
 */
export const dependsOnLinkSpace = 10

/**
 * Determines opacity of links.
 */
export const LinkOpacity = 0.6

/**
 * Configuration constants regarding physical simulation
 */

/**
 * Determines the target distance which link forces push or pull to reach between a pair of connected Nodes.
 * The strength of the force is proportional to the difference between the linked nodes’ distance and the target distance, similar to a spring force.
 *
 * https://github.com/d3/d3-force#links
 */
export const linkForceDistance = 200

/**
 * Specifes the force between all Nodes.
 * Acts as a gravitational attraction force if positive,
 * or as an electrostatic repulsion if negative.
 *
 * https://github.com/d3/d3-force#many-body
 */
export const nodeForce = -1000

/**
 * Determines the long term alpha target for the simulation. In range [0,1].
 *
 * alpha is roughly analogous to temperature in simulated annealing.
 * It decreases over time as the simulation “cools down”.
 * When alpha reaches alphaMin (default 0.001), the simulation stops; see simulation.restart.
 *
 * alpha interpolates towards the target alpha at the default rate - see d3.alphaDecay().
 *
 * https://github.com/d3/d3-force#simulation_alphaTarget
 */
export const alphaTarget = 0

/**
 * Determines how quickly the simulation cools. See d3.alphaDecay().
 * Sets the alpha decay rate to the specified number in the range [0,1]
 *
 * https://github.com/d3/d3-force#simulation_alphaDecay
 */
export const alphaDecay = 0.0227627790442 //d3 default

/**
 * Determines the target alpha after a drag or filter toggle to "reheat" the simulation.
 */
export const reheatAlphaTarget = 0.4

/**
 * Determines the alpha to keep the simulation at during a drag.
 * Higher this is, the more fluid other nodes will move around the dragged node.
 */
export const duringDragAlpha = 0.2

/**
 * The strength of the centering force. Keeps disconnected parts of a graph from flying off.
 *
 * https://github.com/d3/d3-force#positioning
 */
export const centeringForceStrength = 0.02
