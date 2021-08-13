/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Configuration constants regarding physical simulation
 */
export class PhysicsConfig {
    /**
     * Determines the target distance which link forces push or pull to reach between a pair of connected Nodes.
     * The strength of the force is proportional to the difference between the linked nodes’ distance and the target distance, similar to a spring force.
     */
    public static readonly linkForceDistance = 200

    /**
     * Specifes the force between all Nodes.
     * Acts as a gravitational attraction force if positive,
     * or as an electrostatic repulsion if negative.
     */
    public static readonly nodeForce = -1000

    /**
     * Determines the long term alpha target for the simulation. In range [0,1].
     *
     * alpha is roughly analogous to temperature in simulated annealing.
     * It decreases over time as the simulation “cools down”.
     * When alpha reaches alphaMin (default 0.001), the simulation stops; see simulation.restart.
     *
     * alpha interpolates towards the target alpha at the default rate - see d3.alphaDecay().
     */
    public static readonly alphaTarget = 0

    /**
     * Determines how quickly the simulation cools. See d3.alphaDecay().
     * Sets the alpha decay rate to the specified number in the range [0,1]
     *
     * The alpha decay rate determines how quickly the current alpha interpolates towards the desired target alpha;
     * since the default target alpha is zero, by default this controls how quickly the simulation cools.
     * Higher decay rates cause the simulation to stabilize more quickly, but risk getting stuck in a local minimum;
     * lower values cause the simulation to take longer to run, but typically converge on a better layout.
     * To have the simulation run forever at the current alpha, set the decay rate to zero; alternatively,
     * set a target alpha greater than the minimum alpha.
     */
    public static readonly alphaDecay = 0.0227627790442 //d3 default

    /**
     * Determines the target alpha after a drag or filter toggle to "reheat" the simulation.
     */
    public static readonly reheatAlphaTarget = 0.4

    /**
     * Determines the alpha to keep the simulation at during a drag.
     * Higher this is, the more fluid other nodes will move around the dragged node.
     */
    public static readonly duringDragAlpha = 0.2

    public static readonly centeringForceStrength = 0.02
}
