/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { NodeConfig } from '../rendering/configConstants/NodeConfig'
import { LinkConfig } from '../rendering/configConstants/LinkConfig'
import { PhysicsConfig } from '../rendering/configConstants/PhysicsConfig'
import { LinkTypes } from '../samVisualizeTypes'
import * as d3 from 'd3'
import { WebviewApi } from 'vscode-webview'
import { GraphObject } from '../graphGeneration/graph'
import { filterPrimaryOnly } from '../rendering/filter'
import * as _ from 'lodash'

interface NodeDatum extends d3.SimulationNodeDatum {
    name: string
    type?: string
}

interface LinkDatum extends d3.SimulationLinkDatum<NodeDatum> {
    source: string | NodeDatum
    target: string | NodeDatum
    type?: string
}

export class ForceDirectedGraph {
    /**
     * The complete, unfiltered GraphObject
     */
    private completeGraphObject: GraphObject | undefined

    /**
     * A subset of the completeGraphObject, containing only primary nodes and links between them.
     */
    private primaryOnlyGraphObject: GraphObject | undefined

    /**
     * Maps a resource type identifier to a WebviewURI string containing the corresponding icon
     */
    private iconPaths: { [resourceType: string]: string }

    private vscodeApi: WebviewApi<unknown> | undefined

    // The overarching g container containing nodes & links
    // Having this separate container element allows for zooms and pans
    private g: d3.Selection<SVGGElement, unknown, HTMLElement | null, unknown>

    // The d3.Simulation which runs the physics and interactivity of the force directed graph
    public simulation: d3.Simulation<NodeDatum, LinkDatum>

    // Since the link construction uses the id of the arrowheads,
    // it's declared and passed around to avoid mismatching string literals.
    public readonly arrowheadID = 'arrowhead'

    private links: d3.Selection<SVGGElement, LinkDatum, SVGGElement, unknown> | undefined
    private nodes: d3.Selection<SVGGElement, NodeDatum, SVGGElement, unknown> | undefined

    // Holds the div containing the filter radio buttons
    // Visibility is toggled during error renders
    private filterButtonsDiv: d3.Selection<HTMLDivElement, unknown, HTMLElement | null, unknown>

    constructor(
        completeGraphObject: GraphObject,
        primaryResourceList: string[],
        iconPaths: { [resourceType: string]: string },
        doc?: Document
    ) {
        this.completeGraphObject = completeGraphObject
        this.iconPaths = iconPaths

        try {
            this.vscodeApi = acquireVsCodeApi()
        } catch {
            // Test environment
            this.vscodeApi = undefined
        }

        let svgWidth, svgHeight
        try {
            svgWidth = document.querySelector('body')!.clientWidth
            svgHeight = document.querySelector('body')!.clientHeight
        } catch {
            // Test environment
            svgWidth = 500
            svgHeight = 500
        }

        const svg = this.constructSVG(svgWidth, svgHeight, 'svg', doc)
        this.g = this.appendGContainerElement(svg)

        this.defineArrowHead(svg)

        // Define forces
        this.simulation = d3
            .forceSimulation<NodeDatum, LinkDatum>()
            .force(
                'link',
                d3
                    .forceLink<NodeDatum, LinkDatum>()
                    .id((d: NodeDatum) => d.name)
                    .distance(PhysicsConfig.linkForceDistance)
            )
            .force('charge', d3.forceManyBody().strength(PhysicsConfig.nodeForce))
            .force('center', d3.forceCenter(svgWidth / 2, svgHeight / 2))
            .force('forceX', d3.forceX(svgWidth / 2).strength(PhysicsConfig.centeringForceStrength))
            .force('forceY', d3.forceY(svgHeight / 2).strength(PhysicsConfig.centeringForceStrength))

        this.simulation.alphaTarget(PhysicsConfig.alphaTarget)
        this.simulation.alphaDecay(PhysicsConfig.alphaDecay)
        // Don't stop ticking
        this.simulation.alphaMin(-1)

        try {
            // Zoom behavior
            svg.call(
                d3.zoom<SVGSVGElement, unknown>().on('zoom', (event: d3.D3ZoomEvent<SVGGElement, NodeDatum>) => {
                    this.g.attr('transform', event.transform.toString())
                })
            )
        } catch {
            // Skip during testing
        }

        const primaryButtonID = 'primary-button'
        const allButtonID = 'all-button'

        this.filterButtonsDiv = this.drawFilterRadioButtons(primaryButtonID, allButtonID, doc)

        try {
            document.querySelector(`#${primaryButtonID}`)?.addEventListener('change', () => {
                this.update(this.primaryOnlyGraphObject)
            })
            document.querySelector(`#${allButtonID}`)?.addEventListener('change', () => {
                this.update(this.completeGraphObject)
            })
        } catch {
            // Don't add listeners in test environment
        }

        // Add an error message, default display none
        if (doc) {
            // Testing env
            d3.select(doc)
                .select('body')
                .append('span')
                .attr('class', 'error-message')
                .text('Errors detected in template.')
                .style('display', 'none')
        } else {
            d3.select('body')
                .append('span')
                .attr('class', 'error-message')
                .text('Errors detected in template.')
                .style('display', 'none')
        }

        if (this.completeGraphObject) {
            this.primaryOnlyGraphObject = filterPrimaryOnly(this.completeGraphObject, new Set(primaryResourceList))
            // Default view is primary only
            this.update(this.primaryOnlyGraphObject)
        } else {
            // Hide the buttons, don't remove because we want to keep the listeners
            this.filterButtonsDiv.style('display', 'none')
            // Display error message
            d3.select('.error-message').style('display', 'block')
        }
    }
    /**
     * Appends an `svg` element to the `body` of a given `Document`
     
     * @param width The width of the `svg` element
     * @param height The height of the `svg` element
     * @param id The id of the svg created
     * @param doc The document whose `body` the `svg` element is added to
     * @returns A d3 `Selection` of the `svg` element
     */
    public constructSVG(
        width: number,
        height: number,
        id?: string, // Used to select and test created elements. No purpose outside test environment.
        doc?: Document
    ): d3.Selection<SVGSVGElement, unknown, null | HTMLElement, unknown> {
        // This document param is necessary only for testing, to give a 'fake' DOM for d3 to manipulate
        let svg
        if (doc) {
            svg = d3.select(doc).select('body').append<SVGSVGElement>('svg').attr('width', width).attr('height', height)
        } else {
            svg = d3.select('body').append<SVGSVGElement>('svg').attr('width', width).attr('height', height)
        }
        if (id) {
            svg.attr('id', id)
        }
        return svg
    }

    /**
     * Defines an arrowhead `marker` element, with a given color.
     * @param svg A d3 `Selection` of an `svg` element to which the `marker` is added
     * @param color The fill color of the `marker` element
     * @param id The id attribute of the `marker` element
     */
    public defineArrowHead(
        svg: d3.Selection<SVGSVGElement, unknown, null | HTMLElement, unknown>,
        id?: string // Used to select and test created elements. No purpose outside test environment.
    ): void {
        // Create marker within defs
        svg.append('defs')
            .append('marker')
            .attr('class', 'arrowhead')
            .attr('id', id ? id : this.arrowheadID) // Use test id if present
            .attr('viewBox', LinkConfig.arrowheadViewbox)
            // refX = 0 to draw the arrowhead at the end of the path
            .attr('refX', 0)
            // refY = 0 to draw the arrowhead centered on the path
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', LinkConfig.arrowheadSize)
            .attr('markerHeight', LinkConfig.arrowheadSize)
            .attr('markerUnits', 'userSpaceOnUse')
            .append('path')
            .attr('d', LinkConfig.arrowheadShape)
            .style('stroke', 'none')
            .style('opacity', LinkConfig.LinkOpacity)
    }

    /**
     * Appends a `g` element to a given `svg`, to be used as a container for other elements.
     * @param svg A d3 `Selection` of an `svg` element to which the `g` element is added
     * @param id The id of the `g` container appened to the `svg`
     * @returns A d3 `Selection` of the `g` element appended to the given `svg` element
     */
    public appendGContainerElement(
        svg: d3.Selection<SVGSVGElement, unknown, null | HTMLElement, unknown>,
        id?: string // Used to select and test created elements. No purpose outside test environment.
    ): d3.Selection<SVGGElement, unknown, null | HTMLElement, unknown> {
        const g = svg.append('g')
        if (id) {
            g.attr('id', id)
        }
        return g
    }

    /**
     * A `g` element acting as a sub-container is added to the given overarching `g` element.
     * For each Link in the `linkList`, a styled `path` element is created, representing a graph link.
     * The path `d` attribute itself is set and manipulated during simulation.
     * @param overarchingGContainer The overarching `g` acting as a container into which the sub-container `g` is added
     * @param linkList A list of LinkDatum elements representing the links of a graph
     * @param id The id of the sub-container `g`, containing all the links
     * @returns A d3 `Selection` of the `path` elements representing links
     */
    public constructLinks(
        overarchingGContainer: d3.Selection<SVGGElement, unknown, null | HTMLElement, unknown>,
        linkList: Array<LinkDatum>,
        id?: string
    ): d3.Selection<SVGGElement, LinkDatum, SVGGElement, unknown> {
        const linkContainer = overarchingGContainer.append<SVGGElement>('g')
        // Id the g containing the links
        if (id) {
            linkContainer.attr('id', id)
        }

        const links = linkContainer
            .selectAll<SVGGElement, LinkDatum>('link')
            .data<LinkDatum>(linkList)
            .enter()
            .append<SVGGElement>('g')
            .attr('class', 'link')

        links
            .append<SVGPathElement>('path')
            .attr('class', 'visible-link')
            .attr('marker-end', `url(#${this.arrowheadID})`)
            .style('stroke-dasharray', (d: LinkDatum) => {
                if (d.type === LinkTypes.DependsOn) {
                    return `${LinkConfig.dependsOnLinkDash} ${LinkConfig.dependsOnLinkSpace}`
                }
                // eslint-disable-next-line no-null/no-null
                return null
            })
            .style('stroke-width', LinkConfig.linkStrokeWidth)
            .style('fill', 'none')
            .style('stroke-opacity', LinkConfig.LinkOpacity)

        // This draws a thicker line on top of the rendered link
        // to allow for easier mouseover tooltips
        const invisbleStrokeWidth = 25
        links
            .append('path')
            .style('stroke', '#000') // The colour of the stroke doesn't matter, since the opacity is 0
            .style('stroke-opacity', 0)
            .style('stroke-width', invisbleStrokeWidth)
            .append('title')
            .text((d: LinkDatum) => {
                if (!d.type) {
                    return 'Unspecified link type'
                }
                return d.type
            })
        return links
    }

    /**
     * A `g` element acting as a sub-container is added to the given overarching `g` element.
     * For each Node in the `nodeList`, a `g` element is added to the sub-container, representing a node in the graph.
     * `image` and `text` elements are added to each node's `g` element, to draw and label each node.
     * @param overarchingGContainer The overarching `g` acting as a container into which the sub-container `g` is added.
     * @param nodeList A list of NodeDatum elements representing the nodes of a graph.
     * @param iconPaths A map between a resource type and a webview uri string pointing to the corresponding icon
     * @param vscodeApi A reference to the VSCode webview api, which allows nodes to send messages to the extension (eg. onClick)
     * @param id The id of the sub-container `g` containing all the nodes
     * @returns A d3 `Selection` of the `g` elements representing nodes
     */
    public constructNodes(
        overarchingGContainer: d3.Selection<SVGGElement, unknown, null | HTMLElement, unknown>,
        nodeList: Array<NodeDatum>,
        iconPaths: { [resourceType: string]: string },
        vscodeApi?: WebviewApi<unknown>,
        id?: string
    ): d3.Selection<SVGGElement, NodeDatum, SVGGElement, unknown> {
        const nodeContainer = overarchingGContainer.append<SVGGElement>('g')

        if (id) {
            nodeContainer.attr('id', id)
        }
        const nodes = nodeContainer
            .selectAll<SVGGElement, NodeDatum>('node')
            .data<NodeDatum>(nodeList, (d: NodeDatum) => d.name)
            .enter()
            .append<SVGGElement>('g')
            .attr('class', 'node')
            .style('cursor', 'pointer')
            .on(
                'mouseover',
                function (this: SVGGElement, event: d3.D3DragEvent<SVGGElement, NodeDatum, unknown>, d: NodeDatum) {
                    d3.select(this)
                        // Select the clipPath for the current node
                        .select(`#clipCircle-${d.name}`)
                        .select('circle')
                        .transition()
                        .duration(NodeConfig.mouseOverNodeGrowthTime)
                        .attr('r', NodeConfig.radius * NodeConfig.mouseOverNodeSizeMultiplier)

                    d3.select(this)
                        .select('image')
                        .transition()
                        .duration(NodeConfig.mouseOverNodeGrowthTime)
                        .attr('width', NodeConfig.radius * 2 * NodeConfig.mouseOverNodeSizeMultiplier)
                        .attr('height', NodeConfig.radius * 2 * NodeConfig.mouseOverNodeSizeMultiplier)
                        .attr('x', -NodeConfig.radius * NodeConfig.mouseOverNodeSizeMultiplier)
                        .attr('y', -NodeConfig.radius * NodeConfig.mouseOverNodeSizeMultiplier)

                    d3.select(this)
                        .select('.primary-text')
                        .transition()
                        .duration(NodeConfig.mouseOverNodeGrowthTime)
                        .attr('dy', NodeConfig.primaryLabelYOffset * NodeConfig.mouseOverNodeSizeMultiplier)
                        .attr('font-size', NodeConfig.primaryTextSize * NodeConfig.mouseOverNodeSizeMultiplier)

                    d3.select(this)
                        .select('.secondary-text')
                        .transition()
                        .duration(NodeConfig.mouseOverNodeGrowthTime)
                        .attr('dy', NodeConfig.secondaryLabelYOffset * NodeConfig.mouseOverNodeSizeMultiplier)
                        .attr('font-size', NodeConfig.secondaryTextSize * NodeConfig.mouseOverNodeSizeMultiplier)
                }
            )
            .on(
                'mouseout',
                function (this: SVGGElement, event: d3.D3DragEvent<SVGGElement, NodeDatum, unknown>, d: NodeDatum) {
                    d3.select(this)
                        // Select the clipPath for the current node
                        .select(`#clipCircle-${d.name}`)
                        .select('circle')
                        .transition()
                        .duration(NodeConfig.mouseOverNodeGrowthTime)
                        .attr('r', NodeConfig.radius)

                    d3.select(this)
                        .select('image')
                        .transition()
                        .duration(NodeConfig.mouseOverNodeGrowthTime)
                        .attr('width', NodeConfig.radius * 2)
                        .attr('height', NodeConfig.radius * 2)
                        .attr('x', -NodeConfig.radius)
                        .attr('y', -NodeConfig.radius)

                    d3.select(this)
                        .select('.primary-text')
                        .transition()
                        .duration(NodeConfig.mouseOverNodeGrowthTime)
                        .attr('dy', NodeConfig.primaryLabelYOffset)
                        .attr('font-size', NodeConfig.primaryTextSize)

                    d3.select(this)
                        .select('.secondary-text')
                        .transition()
                        .duration(NodeConfig.mouseOverNodeGrowthTime)
                        .attr('dy', NodeConfig.secondaryLabelYOffset)
                        .attr('font-size', NodeConfig.secondaryTextSize)
                }
            )
        // vscodeApi does not exist outside of a Webview, so it's not used during testing
        if (vscodeApi) {
            nodes.on('click', function (event, d: NodeDatum) {
                // Prevent click behavior on drag
                if (event.defaultPrevented) {
                    return
                }
                vscodeApi.postMessage({
                    data: d.name,
                })
            })
        }

        // Define a uniquely identified clipPath to crop icons into circles,
        // and allow each to be individually resized on mouseover.
        nodes
            .append<SVGClipPathElement>('clipPath')
            .attr('id', (d: NodeDatum) => `clipCircle-${d.name}`)
            .append<SVGCircleElement>('circle')
            .attr('r', NodeConfig.radius)

        // Draw an image corresponding to the Node type
        nodes
            .append<SVGImageElement>('image')
            .attr('xlink:href', (d: NodeDatum) => {
                const key = d.type?.toLowerCase()
                if (!key) {
                    return iconPaths['default']
                }
                if (iconPaths[key]) {
                    return iconPaths[key]
                }
                const parts = key.split('::')
                if (iconPaths[`${parts[0]}::${parts[1]}`]) {
                    return iconPaths[`${parts[0]}::${parts[1]}`]
                }
                if (iconPaths[parts[0]]) {
                    return iconPaths[parts[0]]
                }
                return iconPaths['default']
            })
            // Image positioning
            .attr('x', -NodeConfig.radius)
            .attr('y', -NodeConfig.radius)
            // We want the image to be as wide and high as the node itself, before the circle is cut out.
            .attr('height', 2 * NodeConfig.radius)
            .attr('width', 2 * NodeConfig.radius)
            .attr('clip-path', (d: NodeDatum) => `url(#clipCircle-${d.name})`)

        // Gives tooltip of Node name when hovered
        nodes.append('title').text((d: NodeDatum) => d.name)

        // Label each Node with it's resource name
        nodes
            .append<SVGTextElement>('text')
            .attr('class', 'primary-text')
            .attr('text-anchor', 'middle')
            .attr('dy', NodeConfig.primaryLabelYOffset)
            .text((d: NodeDatum) => d.name)
            .attr('font-size', NodeConfig.primaryTextSize)

        // Label each Node with it's full resource type identifier
        nodes
            .append<SVGTextElement>('text')
            .attr('class', 'secondary-text')
            .attr('text-anchor', 'middle')
            .attr('dy', NodeConfig.secondaryLabelYOffset)
            .text((d: NodeDatum) => (d.type ? d.type : ''))
            .attr('font-size', NodeConfig.secondaryTextSize)

        return nodes
    }

    /**
     * Creates a div with two radio buttons, used to toggle filters
     * @param primaryButtonID Id of the button to show only Primary Nodes
     * @param allButtonID Id of the button to show All Nodes
     * @param doc A Document unto which the div is added
     * @param id The id of the div
     * @returns
     */
    public drawFilterRadioButtons(
        primaryButtonID: string,
        allButtonID: string,
        doc?: Document,
        id?: string
    ): d3.Selection<HTMLDivElement, unknown, null | HTMLElement, unknown> {
        let buttonDiv: d3.Selection<HTMLDivElement, unknown, null | HTMLElement, unknown>
        if (doc) {
            buttonDiv = d3.select(doc).select('body').append('div').style('position', 'relative').style('z-index', 2)
        } else {
            // z-index set to 2 to allow the SVG to render underneath the radio buttons
            buttonDiv = d3.select('body').append('div').style('position', 'relative').style('z-index', 2)
        }
        if (id) {
            buttonDiv.attr('id', id)
        }

        const primaryButtonDiv = buttonDiv.append('div')
        primaryButtonDiv
            .append('input')
            .attr('type', 'radio')
            .attr('id', primaryButtonID)
            .attr('name', 'filter-buttons')
            .attr('checked', true)
        primaryButtonDiv
            .append('label')
            .attr('for', primaryButtonID)
            .style('font-size', NodeConfig.primaryTextSize)
            .style('font-weight', 'bold')
            .text('Primary resources')

        const allButtonDiv = buttonDiv.append('div')
        allButtonDiv.append('input').attr('type', 'radio').attr('id', allButtonID).attr('name', 'filter-buttons')
        allButtonDiv
            .append('label')
            .attr('for', allButtonID)
            .style('font-size', NodeConfig.primaryTextSize)
            .style('font-weight', 'bold')
            .text('All resources')

        return buttonDiv
    }

    // Render a GraphObject
    private update(newGraphObject: GraphObject | undefined) {
        // Never occurs. Possibly undefined args are used in calls within a listener declaration,
        // but those listener events are only fired with verified GraphObjects
        if (newGraphObject === undefined) {
            return
        }

        // Clear the graph
        this.g.selectAll('g').remove()

        this.links = this.constructLinks(this.g, newGraphObject.links)
        this.nodes = this.constructNodes(this.g, newGraphObject.nodes, this.iconPaths, this.vscodeApi)

        // Implement drag behavior
        this.nodes.call(
            d3
                .drag<SVGGElement, NodeDatum>()
                .on('start', this.dragStarted)
                .on('drag', this.dragged)
                .on('end', this.dragEnded)
        )
        // Attach nodes & links to simulation, upon which specified forces are applied
        this.simulation.nodes(newGraphObject.nodes).on('tick', () => this.ticked())
        this.simulation.force<d3.ForceLink<NodeDatum, LinkDatum>>('link')?.links(newGraphObject.links)

        // Give energy to a new render
        this.simulation.alphaTarget(PhysicsConfig.reheatAlphaTarget).restart()
    }

    // Arrow function because this function is referenced, and it needs to be bound
    private dragStarted = (event: d3.D3DragEvent<SVGGElement, NodeDatum, unknown>, d: NodeDatum): void => {
        if (!event.active) {
            this.simulation.alphaTarget(PhysicsConfig.reheatAlphaTarget).restart()
        }
        d.fx = d.x
        d.fy = d.y
    }

    // Arrow function because this function is referenced, and it needs to be bound
    private dragged = (event: d3.D3DragEvent<SVGGElement, NodeDatum, unknown>, d: NodeDatum): void => {
        this.simulation.alpha(PhysicsConfig.duringDragAlpha)
        d.fx = event.x
        d.fy = event.y
    }

    // Arrow function because this function is referenced, and it needs to be bound
    private dragEnded = (event: d3.D3DragEvent<SVGGElement, NodeDatum, unknown>, d: NodeDatum): void => {
        delete d.fx
        delete d.fy
    }

    /**
     * Updates link paths and node positions every tick.
     */
    public ticked(): void {
        this.links!.selectAll<SVGGElement, LinkDatum>('path').attr('d', this.calculateLinkPath)
        // // Create a path for the tooltip assistance link, which is just a thicker invisible line
        // // drawn over existing links (same 'd' value) to make it easier to get a tooltip while hovering over a link.
        this.nodes!.attr('transform', (d: NodeDatum) => `translate(${d.x}, ${d.y})`)
        // Once we hit the target after a reheat, begin decaying to long term alpha target
        if (Math.abs(this.simulation.alpha() - PhysicsConfig.reheatAlphaTarget) < 0.001) {
            this.simulation.alphaTarget(PhysicsConfig.alphaTarget).restart()
        }
    }

    /**
     * Scales down a vector to account for the radius of the target node.
     * @param dx Difference between source x and target x
     * @param dy Difference between source y and target y
     * @param targetNodeRadius Target node radius. Pass radius in live to account for growth animations.
     * @returns
     */
    public scaleLinkVector(
        dx: number,
        dy: number,
        targetNodeRadius: number
    ): { xComponent: number; yComponent: number } | undefined {
        const dC = Math.sqrt(dx * dx + dy * dy)
        if (dC === 0) {
            return undefined
        }
        const d = dC - targetNodeRadius - LinkConfig.arrowheadSize
        const ratio = d / dC
        dx *= ratio
        dy *= ratio
        return { xComponent: dx, yComponent: dy }
    }

    // Arrow function because this function is referenced, and it needs to be bound
    private calculateLinkPath = (d: LinkDatum): string | null => {
        // LinkDatum source and target properties may be strings or NodeDatums, hence all the type checks.
        // See d3.SimulationLinkDatum (which LinkDatum extends) documentation:

        //  * For convenience, a link’s source and target properties may be initialized using numeric or string identifiers rather than object references; see link.id.
        //  * When the link force is initialized (or re-initialized, as when the nodes or links change), any link.source or link.target property which is not an object
        //  * is replaced by an object reference to the corresponding node with the given identifier.
        //  * After initialization, the source property represents the source node object.

        // The defined LinkDatum extends d3.SimulationDatum, but overrides the source and target properties to be of type string | NodeDatum,
        // since in this case links are initialized with string identifiers for source and target properties (resource names).
        // This ensures that we do not need to check that d.target and d.source are not numbers.
        const target = d.target
        const source = d.source
        if (!_.isString(target) && !_.isString(source)) {
            // x & y are optional parameters that become initialized post simulation initialization.
            // See d3.SimulationNodeDatum (which NodeDatum extends) documentation:

            //  * IMPORTANT: Prior to initialization, the following properties are optional: index, x, y, vx, and vy.
            //  * After initialization they will be defined. The optional properties fx and fy are ONLY defined,
            //  * if the node's position has been fixed.
            if (target.x && source.x && target.y && source.y) {
                const dx = target.x - source.x
                const dy = target.y - source.y

                // Get the radius of the target node, so that arrowheads will attach to the edge even during resizing
                const targetNodeRadius = parseInt(d3.select(`#clipCircle-${target.name}`).select('circle').attr('r'))

                const linkVector = this.scaleLinkVector(dx, dy, targetNodeRadius)
                // The only time the linkVector will be undefined is if the points of two nodes is exactly the same.
                // The charge force on the nodes will never allow this, even when dragging.
                // Even if this happens, the path will not draw for frames in which it is null, and will resume drawing when nodes are no longer
                // exactly on top of each other.
                if (!linkVector) {
                    // D3.js does not include `undefined` as a return type for a ValueFn, so we must return null in the error case.
                    // See d3.attr documentation
                    // * attr(name: string, value: ValueFn<GElement, Datum, string | number | boolean | null>): this;

                    // eslint-disable-next-line no-null/no-null
                    return null
                }
                const targetX = source.x + linkVector.xComponent
                const targetY = source.y + linkVector.yComponent

                return `M ${source.x}, ${source.y} L ${targetX},${targetY}`
            }
        }

        // eslint-disable-next-line no-null/no-null
        return null
    }
}
