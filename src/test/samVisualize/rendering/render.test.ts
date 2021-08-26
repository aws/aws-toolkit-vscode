/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { ForceDirectedGraph } from '../../../samVisualize/rendering/forceDirectedGraph'
import * as RenderConstants from '../../../samVisualize/rendering/renderConstants'
import * as jsdom from 'jsdom'
import { GraphObject } from '../../../samVisualize/graphGeneration/graph'

const testGraphData: GraphObject = {
    nodes: [
        { name: 'ApiUsagePlan', type: 'AWS::ApiGateway::UsagePlan' },
        { name: 'ApiDeployment', type: 'AWS::ApiGateway::Deployment' },
        { name: 'ApiUsagePlanKey', type: 'AWS::ApiGateway::UsagePlanKey' },
        { name: 'ApiKey', type: 'AWS::ApiGateway::ApiKey' },
        { name: 'APIGatewayRole', type: 'AWS::IAM::Role' },
        { name: 'DynamoDBTable', type: 'AWS::DynamoDB::Table' },
        { name: 'MusicMethodPost', type: 'AWS::ApiGateway::Method' },
        { name: 'MusicArtistMethodGet', type: 'AWS::ApiGateway::Method' },
        { name: 'Api', type: 'AWS::ApiGateway::RestApi' },
        { name: 'MusicResource', type: 'AWS::ApiGateway::Resource' },
        { name: 'MusicArtistResource', type: 'AWS::ApiGateway::Resource' },
    ],
    links: [
        {
            source: 'ApiUsagePlan',
            target: 'ApiDeployment',
            type: 'DependsOn',
        },
        { source: 'ApiUsagePlan', target: 'Api', type: 'Intrinsic Function' },
        { source: 'ApiKey', target: 'ApiDeployment', type: 'DependsOn' },
        { source: 'ApiKey', target: 'Api', type: 'Intrinsic Function' },
        {
            source: 'ApiDeployment',
            target: 'MusicArtistMethodGet',
            type: 'DependsOn',
        },
        { source: 'ApiDeployment', target: 'Api', type: 'Intrinsic Function' },
        {
            source: 'MusicArtistMethodGet',
            target: 'APIGatewayRole',
            type: 'Intrinsic Function',
        },
        { source: 'MusicArtistMethodGet', target: 'Api', type: 'Intrinsic Function' },
        {
            source: 'MusicArtistMethodGet',
            target: 'MusicArtistResource',
            type: 'Intrinsic Function',
        },
        {
            source: 'APIGatewayRole',
            target: 'DynamoDBTable',
            type: 'Intrinsic Function',
        },
        { source: 'ApiUsagePlanKey', target: 'ApiUsagePlan', type: 'Intrinsic Function' },
        { source: 'ApiUsagePlanKey', target: 'ApiKey', type: 'Intrinsic Function' },
        { source: 'MusicResource', target: 'Api', type: 'Intrinsic Function' },
        { source: 'MusicResource', target: 'Api', type: 'Intrinsic Function' },
        { source: 'MusicArtistResource', target: 'Api', type: 'Intrinsic Function' },
        {
            source: 'MusicArtistResource',
            target: 'MusicResource',
            type: 'Intrinsic Function',
        },
        { source: 'MusicMethodPost', target: 'Api', type: 'Intrinsic Function' },
        { source: 'MusicMethodPost', target: 'MusicResource', type: 'Intrinsic Function' },
        {
            source: 'MusicMethodPost',
            target: 'APIGatewayRole',
            type: 'Intrinsic Function',
        },
    ],
}

describe('samVisualize d3.js rendering of a GraphObject', async function () {
    let testDocument: Document
    let window: jsdom.DOMWindow
    let forceDirectedGraph: ForceDirectedGraph

    beforeEach(function () {
        const dom = new jsdom.JSDOM(`<html><body></body></html>`, { runScripts: 'dangerously', resources: 'usable' })
        window = dom.window
        testDocument = window.document

        forceDirectedGraph = new ForceDirectedGraph(testGraphData, [], {}, testDocument)
    })

    it('constructs an svg element with specified width and height', function () {
        forceDirectedGraph.constructSVG(500, 500, 'svg', testDocument)
        const svgElem = testDocument.getElementById('svg')
        assert.ok(svgElem)
        assert.strictEqual(svgElem.getAttribute('width'), '500')
        assert.strictEqual(svgElem.getAttribute('height'), '500')
    })

    it('defines a marker to represent an arrowhead', function () {
        const svg = forceDirectedGraph.constructSVG(500, 500, 'svg', testDocument)
        forceDirectedGraph.defineArrowHead(svg, 'test-arrowhead')

        const arrowheadDefElem = testDocument.getElementById('test-arrowhead')
        assert.ok(arrowheadDefElem)

        const arrowheadPathElem = arrowheadDefElem.getElementsByTagName('path')[0]
        assert.ok(arrowheadPathElem)

        assert.strictEqual(window.getComputedStyle(arrowheadPathElem).opacity, RenderConstants.LinkOpacity.toString())
        // CorrectViewbox
        assert.strictEqual(arrowheadDefElem.getAttribute('viewBox'), RenderConstants.arrowheadViewbox)
        // Square viewbox
        assert.strictEqual(arrowheadDefElem.getAttribute('markerWidth'), RenderConstants.arrowheadSize.toString())
        assert.strictEqual(arrowheadDefElem.getAttribute('markerHeight'), RenderConstants.arrowheadSize.toString())

        // Alignment
        assert.strictEqual(arrowheadDefElem.getAttribute('refX'), '0')
        assert.strictEqual(arrowheadDefElem.getAttribute('refY'), '0')
    })

    it('appends container g element to svg', function () {
        const svg = forceDirectedGraph.constructSVG(500, 500, 'svg', testDocument)
        forceDirectedGraph.appendGContainerElement(svg, 'test-container')

        assert.ok(testDocument.getElementById('test-container'))
    })

    it('creates a path element for each link in the graph', function () {
        const svg = forceDirectedGraph.constructSVG(500, 500, 'svg', testDocument)
        const gContainer = forceDirectedGraph.appendGContainerElement(svg)

        forceDirectedGraph.constructLinks(gContainer, testGraphData.links, 'test-linkContainer')

        assert.ok(testDocument.getElementById('test-linkContainer'))
        const linkList = testDocument.getElementById('test-linkContainer')?.querySelectorAll('.link')
        assert.strictEqual(linkList?.length, testGraphData.links.length)
        linkList.forEach(link => {
            // 2 paths per link
            assert.deepStrictEqual(link.getElementsByTagName('path').length, 2)

            // First path is rendered path
            const renderedPathElem = link.getElementsByTagName('path')[0]
            assert.ok(renderedPathElem)

            assert.deepStrictEqual(
                window.getComputedStyle(renderedPathElem).strokeOpacity,
                RenderConstants.LinkOpacity.toString()
            )

            // Second path is invisible tooltip path
            const tooltipPathElem = link.getElementsByTagName('path')[1]
            assert.ok(tooltipPathElem)
            // Includes tooltip
            assert.ok(tooltipPathElem.getElementsByTagName('title'))
            // Invisible
            assert.deepStrictEqual(window.getComputedStyle(tooltipPathElem).strokeOpacity, '0')
        })
    })
    it('calculates correct vectors for links to surface of node', function () {
        const dx = 100
        const dy = 100
        const radius = 25
        const testVector = forceDirectedGraph.scaleLinkVector(dx, dy, radius)
        assert.ok(testVector)

        assert.deepStrictEqual(Math.abs(testVector.xComponent - 75.25) < 0.01, true, testVector.xComponent.toString())
        assert.deepStrictEqual(Math.abs(testVector.yComponent - 75.25) < 0.01, true, testVector.yComponent.toString())

        assert.ifError(forceDirectedGraph.scaleLinkVector(0, 0, 0))
    })
    it('creates a g element for each node in the graph', function () {
        const svg = forceDirectedGraph.constructSVG(500, 500, 'svg', testDocument)
        const gContainer = forceDirectedGraph.appendGContainerElement(svg)

        forceDirectedGraph.constructNodes(gContainer, testGraphData.nodes, {}, undefined, 'test-nodeContainer')

        const nodeList = testDocument.getElementById('test-nodeContainer')?.querySelectorAll('.node')
        assert.strictEqual(nodeList?.length, testGraphData.nodes.length)
    })

    it('creates correctly labeled circular images for each node ', function () {
        const svg = forceDirectedGraph.constructSVG(500, 500, 'svg', testDocument)
        const gContainer = forceDirectedGraph.appendGContainerElement(svg)

        forceDirectedGraph.constructNodes(gContainer, testGraphData.nodes, {}, undefined, 'test-nodeContainer')

        const nodeList = testDocument.getElementById('test-nodeContainer')?.querySelectorAll('.node')
        assert.ok(nodeList)

        for (let i = 0; i < nodeList.length; i++) {
            const node = nodeList.item(i)
            assert.strictEqual(node.querySelector('clipPath > circle')?.getAttribute('r'), '25')

            const nodeName = node.querySelector('title')?.textContent

            // Node title exists
            assert.ok(nodeName)

            // Primary and secondary labels exist
            const primaryLabel = node.querySelectorAll('text').item(0)
            assert.ok(primaryLabel)

            const secondaryLabel = node.querySelectorAll('text').item(1)
            assert.ok(secondaryLabel)

            // Correct text positioning, primary label matches node name
            assert.strictEqual(primaryLabel.getAttribute('dy'), RenderConstants.primaryLabelYOffset.toString())
            assert.strictEqual(primaryLabel.textContent, nodeName)

            assert.strictEqual(secondaryLabel.getAttribute('dy'), RenderConstants.secondaryLabelYOffset.toString())

            // Secondary label exists and holds a type in the form AWS::<service>::<type>
            const nodeType = secondaryLabel.textContent
            assert.ok(nodeType)
            assert.ok(nodeType.match('AWS::[^:]+::[^:]+'))

            // Assert image exists
            assert.ok(node.querySelector('image'))
        }
    })

    it('creates two radio buttons to toggle filters', function () {
        forceDirectedGraph.drawFilterRadioButtons(
            'test-primaryButton',
            'test-allButton',
            testDocument,
            'test-buttonGroup'
        )

        const buttonGroupElem = testDocument.getElementById('test-buttonGroup')
        const primaryButtonElem = testDocument.getElementById('test-primaryButton')
        const allButtonElem = testDocument.getElementById('test-allButton')
        assert.ok(buttonGroupElem)
        // Primary button exists and is within div
        assert.ok(buttonGroupElem.contains(primaryButtonElem))

        assert.ok(primaryButtonElem)

        assert.strictEqual(primaryButtonElem.getAttribute('type'), 'radio')

        // Default primary is checked
        assert.ok(primaryButtonElem.getAttribute('checked'))

        // All button exists and is within div
        assert.ok(allButtonElem)
        assert.ok(buttonGroupElem.contains(allButtonElem))
        assert.strictEqual(allButtonElem.getAttribute('type'), 'radio')

        // All button is unchecked
        assert.ifError(allButtonElem.getAttribute('checked'))

        // Buttons have same name, forming a radio button group
        assert.strictEqual(primaryButtonElem.getAttribute('name'), allButtonElem.getAttribute('name'))
    })

    it('successfully defines a simulation', function () {
        const s = forceDirectedGraph.simulation
        assert.ok(s)
        assert.ok(s.force('charge'))
        assert.ok(s.force('center'))
        assert.ok(s.force('forceX'))
        assert.ok(s.force('forceY'))
        assert.deepStrictEqual(s.alphaTarget(), RenderConstants.reheatAlphaTarget)
        assert.deepStrictEqual(s.alphaDecay(), RenderConstants.alphaDecay)
        assert.deepStrictEqual(s.alphaMin(), -1)
    })

    it('adjusts alphaTarget on tick', function () {
        const s = forceDirectedGraph.simulation

        assert.deepStrictEqual(s.alphaTarget(), RenderConstants.reheatAlphaTarget)
        forceDirectedGraph.ticked()
        assert.deepStrictEqual(s.alphaTarget(), RenderConstants.reheatAlphaTarget)
        s.alpha(RenderConstants.reheatAlphaTarget)
        forceDirectedGraph.ticked()
        // After hitting reheat goal, target is set to long term value
        assert.deepStrictEqual(s.alphaTarget(), RenderConstants.alphaTarget)
    })

    it('error message is defined, but not displayed by default', function () {
        const errorMessageElem = testDocument.getElementsByClassName('error-message')[0]
        assert.ok(errorMessageElem)

        assert.strictEqual(window.getComputedStyle(errorMessageElem).display, 'none')
    })
})
