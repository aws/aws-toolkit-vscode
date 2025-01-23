/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'

import { Schemas } from 'aws-sdk'
import * as sinon from 'sinon'
import { SchemasNode } from '../../../eventSchemas/explorer/schemasNode'
import { getTabSizeSetting } from '../../../shared/utilities/editorUtilities'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'

import { MockOutputChannel } from '../../mockOutputChannel'
import {
    getPageHeader,
    getRegistryNames,
    getSearchListForSingleRegistry,
    getSearchResults,
    SearchSchemasWebview,
} from '../../../eventSchemas/vue/searchSchemas'
import { RegistryItemNode } from '../../../eventSchemas/explorer/registryItemNode'
import { DefaultSchemaClient } from '../../../shared/clients/schemaClient'
import { stub } from '../../utilities/stubber'
import { getTestWindow } from '../../shared/vscode/window'
import { SeverityLevel } from '../../shared/vscode/message'

describe('Search Schemas', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    const schemaClient = new DefaultSchemaClient('')
    const testRegistry = 'testRegistry'
    const testRegistry2 = 'testRegistry2'
    const failRegistry = 'failRegistry'
    const failRegistry2 = 'failRegistry2'

    const versionSummary1: Schemas.SearchSchemaVersionSummary = {
        SchemaVersion: '1',
    }
    const versionSummary2: Schemas.SearchSchemaVersionSummary = {
        SchemaVersion: '2',
    }
    const searchSummary1: Schemas.SearchSchemaSummary = {
        RegistryName: testRegistry,
        SchemaName: 'testSchema1',
        SchemaVersions: [versionSummary1, versionSummary2],
    }

    const searchSummary2: Schemas.SearchSchemaSummary = {
        RegistryName: testRegistry,
        SchemaName: 'testSchema2',
        SchemaVersions: [versionSummary1],
    }

    const searchSummary3: Schemas.SearchSchemaSummary = {
        RegistryName: testRegistry2,
        SchemaName: 'testSchema3',
        SchemaVersions: [versionSummary1],
    }

    function createWebview(registryNames: string[]): SearchSchemasWebview {
        return new SearchSchemasWebview(new MockOutputChannel(), schemaClient, {
            RegistryNames: registryNames,
            Header: getPageHeader(registryNames),
            SearchInputPlaceholder: '',
            VersionPrefix: '',
            Region: '',
            LocalizedMessages: {
                noSchemasFound: '',
                searching: '',
                loading: '',
                select: '',
            },
        })
    }

    describe('getSearchListForSingleRegistry', function () {
        it('should return summaries', async function () {
            const client = stub(DefaultSchemaClient, { regionCode: 'region-1' })
            client.searchSchemas.returns(asyncGenerator([searchSummary1, searchSummary2]))

            const results = await getSearchListForSingleRegistry(client, testRegistry, 'searchText')

            assert.strictEqual(results.length, 2, 'search should return 2 summaries')

            assert.strictEqual(results[0].VersionList.length, 2, 'first summary has two verions')
            assert.strictEqual(results[0].VersionList[0], '2', 'first version should be 2 - descending order')
            assert.strictEqual(results[0].VersionList[1], '1', 'second version should be 1')

            assert.strictEqual(results[1].VersionList.length, 1, 'second summary has 1 version')
            assert.strictEqual(results[1].VersionList[0], '1', 'version should be 1')
            assert.strictEqual(
                results[0].Title,
                searchSummary1.SchemaName!,
                'title should be same as schemaName, no prefix appended'
            )
            assert.strictEqual(
                results[1].Title,
                searchSummary2.SchemaName!,
                'title should be same as schemaName, no prefix appended'
            )

            assert.strictEqual(results[0].RegistryName, testRegistry, 'summary should belong to requested registry')
            assert.strictEqual(results[1].RegistryName, testRegistry, 'summary should belong to requested registry')
        })

        it('should display an error message when search api call fails', async function () {
            const client = stub(DefaultSchemaClient, { regionCode: 'region-1' })
            const displayMessage = `Unable to search registry ${failRegistry}`

            // make an api call with non existent registryName - should return empty results
            const results = await getSearchListForSingleRegistry(client, failRegistry, 'randomText')

            assert.strictEqual(results.length, 0, 'should return 0 summaries')
            const errorMessages = getTestWindow().shownMessages.filter((m) => m.severity === SeverityLevel.Error)
            assert.strictEqual(errorMessages.length, 1, 'error message should be shown exactly once')
            assert.strictEqual(errorMessages[0].message, displayMessage, 'should display correct error message')
        })
    })

    describe('getSearchResults', function () {
        it('should display error message for failed registries and return summaries for successful ones', async function () {
            const displayMessage = `Unable to search registry ${failRegistry}`
            const displayMessage2 = `Unable to search registry ${failRegistry2}`

            const searchSummaryList1 = [searchSummary1, searchSummary2]
            const searchSummaryList2 = [searchSummary3]

            const searchSchemaStub = sandbox.stub(schemaClient, 'searchSchemas')
            searchSchemaStub.withArgs('randomText', testRegistry).returns(asyncGenerator(searchSummaryList1)).onCall(0)
            searchSchemaStub.withArgs('randomText', testRegistry2).returns(asyncGenerator(searchSummaryList2)).onCall(1)
            const results = await getSearchResults(
                schemaClient,
                [testRegistry, testRegistry2, failRegistry, failRegistry2],
                'randomText'
            )

            assert.strictEqual(results.length, 3, 'should return 3 summaries')

            // results are unordered, sort for testing purposes
            results.sort(function (a, b) {
                return a.RegistryName > b.RegistryName ? 1 : b.RegistryName > a.RegistryName ? -1 : 0
            })
            const expectedTitle1 = testRegistry.concat('/', searchSummary1.SchemaName!)
            const expectedTitle2 = testRegistry.concat('/', searchSummary2.SchemaName!)
            const expectedTitle3 = testRegistry2.concat('/', searchSummary3.SchemaName!)

            assert.strictEqual(results[0].RegistryName, testRegistry, 'sumnmary should belong to requested registry')
            assert.strictEqual(results[1].RegistryName, testRegistry, 'sumnmary should belong to requested registry')
            assert.strictEqual(results[2].RegistryName, testRegistry2, 'sumnmary should belong to requested registry')

            assert.strictEqual(results[0].Title, expectedTitle1, 'title should be prefixed with registryName')
            assert.strictEqual(results[1].Title, expectedTitle2, 'title should be prefixed with registryName')
            assert.strictEqual(results[2].Title, expectedTitle3, 'title should be prefixed with registryName')

            assert.strictEqual(results[0].VersionList.length, 2, 'first summary has 2 versions')
            assert.strictEqual(results[1].VersionList.length, 1, 'second summary has 1 version')
            assert.strictEqual(results[2].VersionList.length, 1, 'third summary has 1 version')

            // failed registries
            const errorMessages = getTestWindow().shownMessages.filter((m) => m.severity === SeverityLevel.Error)
            assert.strictEqual(errorMessages.length, 2, 'should display 2 error message, 1 per each failed registry')
            errorMessages[0].assertMessage(displayMessage)
            errorMessages[1].assertMessage(displayMessage2)
        })
    })

    describe('handleMessage', function () {
        const singleRegistryName = [testRegistry]
        const multipleRegistryNames = [testRegistry, testRegistry2]
        const awsEventSchemaRaw =
            '{"openapi":"3.0.0","info":{"version":"1.0.0","title":"Event"},"paths":{},"components":{"schemas":{"Event":{"type":"object"}}}}'
        const schemaResponse: Schemas.DescribeSchemaResponse = {
            Content: awsEventSchemaRaw,
        }

        it('shows schema content for latest matching schema version by default', async function () {
            const versionedSummary = {
                RegistryName: testRegistry,
                Title: getPageHeader(singleRegistryName),
                VersionList: ['3', '2', '1'],
            }

            sandbox.stub(schemaClient, 'describeSchema').returns(Promise.resolve(schemaResponse))

            const webview = createWebview(singleRegistryName)
            const resp = await webview.fetchSchemaContent(versionedSummary)

            assert.strictEqual(
                resp.results,
                JSON.stringify(JSON.parse(schemaResponse.Content!), undefined, getTabSizeSetting())
            )
            assert.strictEqual(resp.version, '3')
            assert.strictEqual(resp.versionList, versionedSummary.VersionList)
        })

        it('shows schema content for user selected version', async function () {
            const versionedSummary = {
                RegistryName: testRegistry,
                Title: getPageHeader(multipleRegistryNames),
                VersionList: ['1'],
            }

            sandbox.stub(schemaClient, 'describeSchema').returns(Promise.resolve(schemaResponse))

            const webview = createWebview(multipleRegistryNames)
            const resp = await webview.fetchSchemaContent(versionedSummary, '1')
            assert.strictEqual(
                resp.results,
                JSON.stringify(JSON.parse(schemaResponse.Content!), undefined, getTabSizeSetting())
            )
            assert.strictEqual(resp.version, '1')
            assert.strictEqual(resp.versionList, undefined)
        })

        it('shows schema list when user makes a search', async function () {
            const expectResults1 = {
                RegistryName: testRegistry,
                Title: testRegistry + '/testSchema1',
                VersionList: ['2', '1'],
            }
            const expectResults2 = {
                RegistryName: testRegistry,
                Title: testRegistry + '/testSchema2',
                VersionList: ['1'],
            }

            const searchSummaryList = [searchSummary1, searchSummary2]
            sandbox
                .stub(schemaClient, 'searchSchemas')
                .withArgs('searchText', testRegistry)
                .returns(asyncGenerator(searchSummaryList))

            const webview = createWebview([testRegistry, testRegistry])
            const resp = await webview.searchSchemas('searchText')

            assert.deepStrictEqual(resp.results, [expectResults1, expectResults2])
            assert.strictEqual(resp.resultsNotFound, false)
        })
    })

    describe('getRegistryNameList', function () {
        it('should return list with single registry name for registryItemNode', async function () {
            const fakeRegistryNew = {
                RegistryName: testRegistry,
                RegistryArn: 'arn:aws:schemas:us-west-2:19930409:registry/testRegistry',
            }

            const registryItemNode = new RegistryItemNode(fakeRegistryNew, schemaClient)

            const result = await getRegistryNames(registryItemNode, schemaClient)
            assert.deepStrictEqual(result, [testRegistry], 'should have a single registry name in it')
        })

        it('should return list with multiple registry names for schemasNode', async function () {
            const schemasNode = new SchemasNode(schemaClient)
            const registrySummary1 = { RegistryArn: 'arn:aws:registry/' + testRegistry, RegistryName: testRegistry }
            const registrySummary2 = { RegistryArn: 'arn:aws:registry/' + testRegistry2, RegistryName: testRegistry2 }

            sandbox.stub(schemaClient, 'listRegistries').returns(asyncGenerator([registrySummary1, registrySummary2]))

            const result = await getRegistryNames(schemasNode, schemaClient)
            assert.deepStrictEqual(result, [testRegistry, testRegistry2], 'should have two registry names in it')
        })

        it('should return an empty list and display error message if schemas service not available in the region', async function () {
            const schemasNode = new SchemasNode(schemaClient)
            sandbox.stub(schemaClient, 'listRegistries')

            const results = await getRegistryNames(schemasNode, schemaClient)

            assert.ok(results.length === 0, 'Should return an empty array')
            const errorMessages = getTestWindow().shownMessages.filter((m) => m.severity === SeverityLevel.Error)
            assert.strictEqual(errorMessages.length, 1, 'should display 1 error message')
            errorMessages[0].assertMessage('Error loading Schemas resources')
        })
    })
})
