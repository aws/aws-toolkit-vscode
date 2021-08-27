/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as RenderConstants from '../rendering/renderConstants'
import { RenderedLinkTypes } from '../samVisualizeTypes'
import * as d3 from 'd3'
import { WebviewApi } from 'vscode-webview'
import { GraphObject } from '../graphGeneration/graph'
import { filterPrimaryOnly } from '../rendering/filter'
import { MessageTypes } from '../samVisualizeTypes'
import * as _ from 'lodash'
import { MessageObject } from '../samVisualization'

interface NodeDatum extends d3.SimulationNodeDatum {
    name: string
    type?: string
}

interface LinkDatum extends d3.SimulationLinkDatum<NodeDatum> {
    source: string | NodeDatum
    target: string | NodeDatum
    type?: string
}

// Third generic is null during testing, when the testDocument is selected first (no parent element type), and everything else selected from it
type SVGSelection = d3.Selection<SVGSVGElement, unknown, null | HTMLElement, unknown>

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

    // Represents the name of the node currently 'selected' in the template.
    // That is, whichever resource definition the cursor is in
    // Undefined if the editor containing the template does not have focus, or if the cursor is not in any resource definition
    private nodeSelectedFromTemplate: string | undefined

    public constructor(
        completeGraphObject: GraphObject,
        primaryResourceList: string[],
        iconPaths: { [resourceType: string]: string },
        testDocument?: Document // Alternative Document is only supplied in a test run
    ) {
        this.completeGraphObject = completeGraphObject
        this.iconPaths = iconPaths

        // Test environment
        // VsCodeApi cannot be acquired unless in webview.
        if (testDocument) {
            this.vscodeApi = undefined
        } else {
            this.vscodeApi = acquireVsCodeApi()
        }

        let svgWidth, svgHeight
        // Test environment
        // clientWidth & clientHeight are not accessible outside of webview
        if (testDocument) {
            // Mock width and height for testing
            svgWidth = 500
            svgHeight = 500
        } else {
            svgWidth = document.querySelector('body')!.clientWidth
            svgHeight = document.querySelector('body')!.clientHeight
        }

        const svg = this.constructSVG(svgWidth, svgHeight, 'svg', testDocument)
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
                    .distance(RenderConstants.linkForceDistance)
            )
            .force('charge', d3.forceManyBody().strength(RenderConstants.nodeForce))
            .force('center', d3.forceCenter(svgWidth / 2, svgHeight / 2))
            .force('forceX', d3.forceX(svgWidth / 2).strength(RenderConstants.centeringForceStrength))
            .force('forceY', d3.forceY(svgHeight / 2).strength(RenderConstants.centeringForceStrength))

        this.simulation.alphaTarget(RenderConstants.alphaTarget)
        this.simulation.alphaDecay(RenderConstants.alphaDecay)
        // Don't stop ticking
        this.simulation.alphaMin(-1)

        // zoom behvior cannot be implemented without webview
        if (!testDocument) {
            // Zoom behavior
            svg.call(
                d3.zoom<SVGSVGElement, unknown>().on('zoom', (event: d3.D3ZoomEvent<SVGGElement, NodeDatum>) => {
                    this.g.attr('transform', event.transform.toString())
                })
            )
        }

        const primaryButtonID = 'primary-button'
        const allButtonID = 'all-button'

        this.filterButtonsDiv = this.drawFilterRadioButtons(primaryButtonID, allButtonID, testDocument)

        // Add an error message, default display none
        if (testDocument) {
            // Testing env
            d3.select(testDocument)
                .select('body')
                .append('span')
                .attr('class', 'error-message')
                .text('Errors detected in template, cannot preview.')
                .style('display', 'none')

            d3.select(testDocument)
                .select('body')
                .append('button')
                .attr('id', 'view-logs-button')
                .text('View Logs')
                .style('display', 'none')
        } else {
            d3.select('body')
                .append('span')
                .attr('class', 'error-message')
                .text('Errors detected in template, cannot preview.')
                .style('display', 'none')

            d3.select('body').append('button').attr('id', 'view-logs-button').text('View Logs').style('display', 'none')
        }

        // Event listeners cannot be added outside of webview
        if (!testDocument) {
            document.getElementById(primaryButtonID)?.addEventListener('change', () => {
                this.update(this.primaryOnlyGraphObject)
            })
            document.getElementById(allButtonID)?.addEventListener('change', () => {
                this.update(this.completeGraphObject)
            })

            document.getElementById('view-logs-button')?.addEventListener('click', () => {
                this.vscodeApi!.postMessage({
                    command: MessageTypes.ViewLogs,
                })
            })
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
            // Display view-logs button
            d3.select('#view-logs-button').style('display', 'block')
        }

        // No live updates during unit tests
        // Contents are tested individually
        if (!testDocument) {
            window.addEventListener('message', event => {
                const message: MessageObject = event.data
                switch (message.command) {
                    case MessageTypes.UpdateVisualization: {
                        const newGraphObject: GraphObject | undefined = message.data
                        if (newGraphObject === undefined) {
                            // Clear the graph
                            this.g.selectAll('g').remove()

                            // Hide the buttons, don't remove because we want to keep the listeners
                            this.filterButtonsDiv.style('display', 'none')

                            // Display error message
                            d3.select('.error-message').style('display', 'block')

                            // Display view-logs button
                            d3.select('#view-logs-button').style('display', 'block')

                            // Stop ticking
                            this.simulation.stop()
                        } else {
                            // Hide error message
                            d3.select('.error-message').style('display', 'none')

                            // Display view-logs button
                            d3.select('#view-logs-button').style('display', 'none')

                            // Display the buttons
                            this.filterButtonsDiv.style('display', 'block')

                            // update the complete graph
                            this.completeGraphObject = newGraphObject

                            // Re establish the primaryOnly graph
                            this.primaryOnlyGraphObject = filterPrimaryOnly(
                                newGraphObject,
                                new Set(primaryResourceList)
                            )

                            const isPrimaryChecked = d3.select(`#${primaryButtonID}`).property('checked')
                            // Draw graph
                            this.update(isPrimaryChecked ? this.primaryOnlyGraphObject : this.completeGraphObject)
                        }
                        break
                    }
                    case MessageTypes.NavigateFromTemplate: {
                        const newlySelectedNodeName: string = message.data

                        if (!this.nodeSelectedFromTemplate) {
                            this.animateNodeEnlarge(newlySelectedNodeName)
                            this.nodeSelectedFromTemplate = newlySelectedNodeName
                        }
                        // Check if node selected is different from the current node
                        // If so, shrink the old node, and enlarge the newly selected node
                        else if (newlySelectedNodeName !== this.nodeSelectedFromTemplate) {
                            this.shrinkNodeToNormal(this.nodeSelectedFromTemplate)
                            this.animateNodeEnlarge(newlySelectedNodeName)
                            this.nodeSelectedFromTemplate = newlySelectedNodeName
                        }
                        break
                    }
                    case MessageTypes.ClearNodeFocus: {
                        if (this.nodeSelectedFromTemplate) {
                            this.shrinkNodeToNormal(this.nodeSelectedFromTemplate)
                            this.nodeSelectedFromTemplate = undefined
                        }
                        break
                    }
                }
            })
        }
    }
    /**
     * Appends an `svg` element to the `body` of a given `Document`
     
     * @param width The width of the `svg` element
     * @param height The height of the `svg` element
     * @param id The id of the svg created
     * @param testDocument The document whose `body` the `svg` element is added to
     * @returns A d3 `Selection` of the `svg` element
     */
    public constructSVG(
        width: number,
        height: number,
        id?: string, // Used to select and test created elements. No purpose outside test environment.
        testDocument?: Document
    ): SVGSelection {
        // This document param is necessary only for testing, to give a 'fake' DOM for d3 to manipulate
        const body: SVGSelection = testDocument ? d3.select(testDocument).select('body') : d3.select('body')
        const svg: SVGSelection = body.append<SVGSVGElement>('svg').attr('width', width).attr('height', height)
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
        svg: SVGSelection,
        id?: string // Used to select and test created elements. No purpose outside test environment.
    ): void {
        // Create marker within defs
        svg.append('defs')
            .append('marker')
            .attr('class', 'arrowhead')
            .attr('id', id ? id : this.arrowheadID) // Use test id if present
            .attr('viewBox', RenderConstants.arrowheadViewbox)
            // refX = 0 to draw the arrowhead at the end of the path
            .attr('refX', 0)
            // refY = 0 to draw the arrowhead centered on the path
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('markerWidth', RenderConstants.arrowheadSize)
            .attr('markerHeight', RenderConstants.arrowheadSize)
            .attr('markerUnits', 'userSpaceOnUse')
            .append('path')
            .attr('d', RenderConstants.arrowheadShape)
            .style('stroke', 'none')
            .style('opacity', RenderConstants.LinkOpacity)
    }

    /**
     * Appends a `g` element to a given `svg`, to be used as a container for other elements.
     * @param svg A d3 `Selection` of an `svg` element to which the `g` element is added
     * @param id The id of the `g` container appened to the `svg`
     * @returns A d3 `Selection` of the `g` element appended to the given `svg` element
     */
    public appendGContainerElement(
        svg: SVGSelection,
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
                if (d.type === RenderedLinkTypes.DependsOn) {
                    return `${RenderConstants.dependsOnLinkDash} ${RenderConstants.dependsOnLinkSpace}`
                }
                // eslint-disable-next-line no-null/no-null
                return null
            })
            .style('stroke-width', RenderConstants.linkStrokeWidth)
            .style('fill', 'none')
            .style('stroke-opacity', RenderConstants.LinkOpacity)

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
            .attr('id', (d: NodeDatum) => d.name)
            .style('cursor', 'pointer')
            .on('mouseover', (event: d3.D3DragEvent<SVGGElement, NodeDatum, unknown>, d: NodeDatum) => {
                // Don't animate an already enlarged node, as it is selected in the template
                if (d.name === this.nodeSelectedFromTemplate) {
                    return
                }
                this.animateNodeEnlarge(d.name)
            })
            .on('mouseout', (event: d3.D3DragEvent<SVGGElement, NodeDatum, unknown>, d: NodeDatum) => {
                // Don't animate an already enlarged node, as it is selected in the template
                if (d.name === this.nodeSelectedFromTemplate) {
                    return
                }
                this.shrinkNodeToNormal(d.name)
            })
        // vscodeApi does not exist outside of a Webview, so it's not used during testing
        if (vscodeApi) {
            nodes.on('click', function (event, d: NodeDatum) {
                // Prevent click behavior on drag
                if (event.defaultPrevented) {
                    return
                }
                vscodeApi.postMessage({
                    command: MessageTypes.NavigateFromGraph,
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
            .attr('r', RenderConstants.radius)

        // Draw an image corresponding to the Node type
        nodes
            .append<SVGImageElement>('image')
            .attr('xlink:href', (d: NodeDatum) => this.getURIFromMap(iconPaths, d.type))
            // Image positioning
            .attr('x', -RenderConstants.radius)
            .attr('y', -RenderConstants.radius)
            // We want the image to be as wide and high as the node itself, before the circle is cut out.
            .attr('height', 2 * RenderConstants.radius)
            .attr('width', 2 * RenderConstants.radius)
            .attr('clip-path', (d: NodeDatum) => `url(#clipCircle-${d.name})`)

        // Gives tooltip of Node name when hovered
        nodes.append('title').text((d: NodeDatum) => d.name)

        // Label each Node with it's resource name
        nodes
            .append<SVGTextElement>('text')
            .attr('class', 'primary-text')
            .attr('text-anchor', 'middle')
            .attr('dy', RenderConstants.primaryLabelYOffset)
            .text((d: NodeDatum) => d.name)
            .attr('font-size', RenderConstants.primaryTextSize)

        // Label each Node with it's full resource type identifier
        nodes
            .append<SVGTextElement>('text')
            .attr('class', 'secondary-text')
            .attr('text-anchor', 'middle')
            .attr('dy', RenderConstants.secondaryLabelYOffset)
            .text((d: NodeDatum) => (d.type ? d.type : ''))
            .attr('font-size', RenderConstants.secondaryTextSize)

        return nodes
    }

    /**
     * Creates a div with two radio buttons, used to toggle filters
     * @param primaryButtonID Id of the button to show only Primary Nodes
     * @param allButtonID Id of the button to show All Nodes
     * @param testDocument A Document unto which the div is added
     * @param id The id of the div
     * @returns
     */
    public drawFilterRadioButtons(
        primaryButtonID: string,
        allButtonID: string,
        testDocument?: Document,
        id?: string
    ): d3.Selection<HTMLDivElement, unknown, null | HTMLElement, unknown> {
        let buttonDiv: d3.Selection<HTMLDivElement, unknown, null | HTMLElement, unknown>
        if (testDocument) {
            buttonDiv = d3
                .select(testDocument)
                .select('body')
                .append('div')
                .style('position', 'relative')
                .style('z-index', 2)
                .style('margin', '1em')
        } else {
            // z-index set to 2 to allow the SVG to render underneath the radio buttons
            buttonDiv = d3
                .select('body')
                .append('div')
                .style('position', 'relative')
                .style('z-index', 2)
                .style('margin', '1em')
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
            .style('font-size', RenderConstants.primaryTextSize)
            .text('Primary resources')

        const allButtonDiv = buttonDiv.append('div')
        allButtonDiv.append('input').attr('type', 'radio').attr('id', allButtonID).attr('name', 'filter-buttons')
        allButtonDiv
            .append('label')
            .attr('for', allButtonID)
            .style('font-size', RenderConstants.primaryTextSize)
            .text('All resources')

        return buttonDiv
    }

    private animateNodeEnlarge(nodeName: string): void {
        const largeRadius = RenderConstants.radius * RenderConstants.mouseOverNodeSizeMultiplier
        d3.select(`#${nodeName}`)
            .select(`#clipCircle-${nodeName}`)
            .select('circle')
            .transition()
            .duration(RenderConstants.mouseOverNodeGrowthTime)
            .attr('r', largeRadius)

        d3.select(`#${nodeName}`)
            .select('image')
            .transition()
            .duration(RenderConstants.mouseOverNodeGrowthTime)
            .attr('width', 2 * largeRadius)
            .attr('height', 2 * largeRadius)
            .attr('x', -largeRadius)
            .attr('y', -largeRadius)

        d3.select(`#${nodeName}`)
            .select('.primary-text')
            .transition()
            .duration(RenderConstants.mouseOverNodeGrowthTime)
            .attr('dy', RenderConstants.primaryLabelYOffset * RenderConstants.mouseOverNodeSizeMultiplier)
            .attr('font-size', RenderConstants.primaryTextSize * RenderConstants.mouseOverNodeSizeMultiplier)

        d3.select(`#${nodeName}`)
            .select('.secondary-text')
            .transition()
            .duration(RenderConstants.mouseOverNodeGrowthTime)
            .attr('dy', RenderConstants.secondaryLabelYOffset * RenderConstants.mouseOverNodeSizeMultiplier)
            .attr('font-size', RenderConstants.secondaryTextSize * RenderConstants.mouseOverNodeSizeMultiplier)
    }

    private shrinkNodeToNormal(nodeName: string): void {
        d3.select(`#${nodeName}`)
            .select(`#clipCircle-${nodeName}`)
            .select('circle')
            .transition()
            .duration(RenderConstants.mouseOverNodeGrowthTime)
            .attr('r', RenderConstants.radius)

        d3.select(`#${nodeName}`)
            .select('image')
            .transition()
            .duration(RenderConstants.mouseOverNodeGrowthTime)
            .attr('width', RenderConstants.radius * 2)
            .attr('height', RenderConstants.radius * 2)
            .attr('x', -RenderConstants.radius)
            .attr('y', -RenderConstants.radius)

        d3.select(`#${nodeName}`)
            .select('.primary-text')
            .transition()
            .duration(RenderConstants.mouseOverNodeGrowthTime)
            .attr('dy', RenderConstants.primaryLabelYOffset)
            .attr('font-size', RenderConstants.primaryTextSize)

        d3.select(`#${nodeName}`)
            .select('.secondary-text')
            .transition()
            .duration(RenderConstants.mouseOverNodeGrowthTime)
            .attr('dy', RenderConstants.secondaryLabelYOffset)
            .attr('font-size', RenderConstants.secondaryTextSize)
    }

    // Render a GraphObject
    private update(newGraphObject: GraphObject | undefined): void {
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
        this.simulation.alphaTarget(RenderConstants.reheatAlphaTarget).restart()
    }
    private dragStarted = (event: d3.D3DragEvent<SVGGElement, NodeDatum, unknown>, d: NodeDatum): void => {
        if (!event.active) {
            this.simulation.alphaTarget(RenderConstants.reheatAlphaTarget).restart()
        }
        d.fx = d.x
        d.fy = d.y
    }

    private dragged = (event: d3.D3DragEvent<SVGGElement, NodeDatum, unknown>, d: NodeDatum): void => {
        this.simulation.alpha(RenderConstants.duringDragAlpha)
        d.fx = event.x
        d.fy = event.y
    }

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
        if (Math.abs(this.simulation.alpha() - RenderConstants.reheatAlphaTarget) < 0.001) {
            this.simulation.alphaTarget(RenderConstants.alphaTarget).restart()
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
        const d = dC - targetNodeRadius - RenderConstants.arrowheadSize
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

        // D3.js does not include `undefined` as a return type for a ValueFn, so we must return null in the error cases.
        // See d3.attr documentation
        // * attr(name: string, value: ValueFn<GElement, Datum, string | number | boolean | null>): this;

        const target = d.target
        const source = d.source
        if (_.isString(target) || _.isString(source)) {
            // eslint-disable-next-line no-null/no-null
            return null
        }

        // x & y are optional parameters that become initialized post simulation initialization.
        // See d3.SimulationNodeDatum (which NodeDatum extends) documentation:

        //  * IMPORTANT: Prior to initialization, the following properties are optional: index, x, y, vx, and vy.
        //  * After initialization they will be defined. The optional properties fx and fy are ONLY defined,
        //  * if the node's position has been fixed.
        if (!target.x || !source.x || !target.y || !source.y) {
            // eslint-disable-next-line no-null/no-null
            return null
        }

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
            // eslint-disable-next-line no-null/no-null
            return null
        }
        const targetX = source.x + linkVector.xComponent
        const targetY = source.y + linkVector.yComponent

        return `M ${source.x}, ${source.y} L ${targetX},${targetY}`
    }

    /**
     * Fetches the appropriate URI for a given resource type from a given map of resource types to icon URIs.
     * @param iconsMap A map of resource types to URI strings pointing to corresponding icons
     * @param resourceType The resource type to fetch an icon URI for. If undefined, a default icon URI is returned.
     * @returns A URI string pointing to the icon corresponding to the resource type.
     *          If no match is found in the map, or if the resource type is undefined, a URI string pointing to a default icon is returned.
     */
    private getURIFromMap(iconsMap: { [resourceType: string]: string }, resourceType?: string): string {
        if (!resourceType) {
            return iconsMap['default']
        }
        const key = resourceType.toLowerCase()
        // Look for a direct match, matching service name and data type.
        // If an icon is found, it's specific only to the data type.
        // Eg. AWS::S3::Bucket -> Icon for Bucket only, and no other S3 data type
        if (iconsMap[key]) {
            return iconsMap[key]
        }

        const parts = key.split('::')

        // If a data type specific icon does not exist, look for an icon that applies to the whole service
        // Eg. AWS::S3::Bucket -> Icon for any S3 data type
        const serviceKey = `${parts[0]}::${parts[1]}`
        if (iconsMap[serviceKey]) {
            return iconsMap[serviceKey]
        }

        // If a particular service icon does not exist, look for an icon that applies to the whole service provider
        // Eg. AWS::S3::Bucket -> Icon for any AWS service or data type
        if (iconsMap[parts[0]]) {
            return iconsMap[parts[0]]
        }

        // If a service provider icon does not exist, use the default icon
        return iconsMap['default']
    }
}
