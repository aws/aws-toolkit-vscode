/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Configuration constants regarding Link rendering
 */
export class LinkConfig {
    /**
     * Determines the viewbox for the arrowheads at the end of the Link
     */
    public static readonly arrowheadViewbox = '0 -5 10 10'

    /**
     * Determines size (width and height) of viewport for which the arrowhead markers are fitted.
     */
    public static readonly arrowheadSize = 10

    /**
     * Defines the path which draws the arrowhead shape.
     */
    public static readonly arrowheadShape = 'M 0,-5 L 10,0 L 0,5'

    /**
     * Determines the width of default links
     */
    public static readonly linkStrokeWidth = 2

    /**
     * Specifies the length of a dash in a dashed dependsOn link
     */
    public static readonly dependsOnLinkDash = 10

    /**
     * Specifies the length of a dash in a dashed dependsOn link
     */
    public static readonly dependsOnLinkSpace = 10

    /**
     * Determines opacity of links.
     */
    public static readonly LinkOpacity = 0.6
}
