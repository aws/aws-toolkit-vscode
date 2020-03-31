/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'

import { Schemas } from 'aws-sdk'
import * as sinon from 'sinon'
import {
    CommandMessage,
    createMessageReceivedFunc,
    getPageHeader,
    getRegistryNames,
    getSearchListForSingleRegistry,
    getSearchResults,
} from '../../../eventSchemas/commands/searchSchemas'
import { RegistryItemNode } from '../../../eventSchemas/explorer/registryItemNode'
import { SchemasNode } from '../../../eventSchemas/explorer/schemasNode'
import { TelemetryService } from '../../../shared/telemetry/telemetryService'
import { getTabSizeSetting } from '../../../shared/utilities/editorUtilities'
import { assertThrowsError } from '../../../test/shared/utilities/assertUtils'
import { MockSchemaClient } from '../../shared/clients/mockClients'
import { asyncGenerator } from '../../utilities/collectionUtils'

import * as vscode from 'vscode'

describe('Search Schemas', () => {
    let sandbox: sinon.SinonSandbox
    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    const schemaClient = new MockSchemaClient()
    const TEST_REGISTRY = 'testRegistry'
    const TEST_REGISTRY2 = 'testRegistry2'
    const FAIL_REGISTRY = 'failRegistry'
    const FAIL_REGISTRY2 = 'failRegistry2'
    const fakeRegion = 'testRegion'

    const versionSummary1: Schemas.SearchSchemaVersionSummary = {
        SchemaVersion: '1',
    }
    const versionSummary2: Schemas.SearchSchemaVersionSummary = {
        SchemaVersion: '2',
    }
    const searchSummary1: Schemas.SearchSchemaSummary = {
        RegistryName: TEST_REGISTRY,
        SchemaName: 'testSchema1',
        SchemaVersions: [versionSummary1, versionSummary2],
    }

    const searchSummary2: Schemas.SearchSchemaSummary = {
        RegistryName: TEST_REGISTRY,
        SchemaName: 'testSchema2',
        SchemaVersions: [versionSummary1],
    }

    const searchSummary3: Schemas.SearchSchemaSummary = {
        RegistryName: TEST_REGISTRY2,
        SchemaName: 'testSchema3',
        SchemaVersions: [versionSummary1],
    }

    describe('getSearchListForSingleRegistry', () => {
        it('should return summaries', async () => {
            const searchSummaryList = [searchSummary1, searchSummary2]

            sandbox
                .stub(schemaClient, 'searchSchemas')
                .withArgs('searchText', TEST_REGISTRY)
                .returns(asyncGenerator(searchSummaryList))

            const results = await getSearchListForSingleRegistry(schemaClient, TEST_REGISTRY, 'searchText')

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

            assert.strictEqual(results[0].RegistryName, TEST_REGISTRY, 'summary should belong to requested registry')
            assert.strictEqual(results[1].RegistryName, TEST_REGISTRY, 'summary should belong to requested registry')
        })

        it('should display an error message when search api call fails', async () => {
            const searchSummaryList = [searchSummary1, searchSummary2]

            const vscodeSpy = sandbox.spy(vscode.window, 'showErrorMessage')
            const displayMessage = `Unable to search registry ${FAIL_REGISTRY}`

            sandbox
                .stub(schemaClient, 'searchSchemas')
                .withArgs('randomText', TEST_REGISTRY)
                .returns(asyncGenerator(searchSummaryList))

            //make an api call with non existent registryName - should return empty results
            const results = await getSearchListForSingleRegistry(schemaClient, FAIL_REGISTRY, 'randomText')

            assert.strictEqual(results.length, 0, 'should return 0 summaries')
            assert.strictEqual(vscodeSpy.callCount, 1, ' error message should be shown exactly once')
            assert.strictEqual(vscodeSpy.firstCall.lastArg, displayMessage, 'should display correct error message')
        })
    })

    describe('getSearchResults', () => {
        it('should display error message for failed registries and return summaries for successful ones', async () => {
            const vscodeSpy = sandbox.spy(vscode.window, 'showErrorMessage')
            const displayMessage = `Unable to search registry ${FAIL_REGISTRY}`
            const displayMessage2 = `Unable to search registry ${FAIL_REGISTRY2}`

            const searchSummaryList1 = [searchSummary1, searchSummary2]
            const searchSummaryList2 = [searchSummary3]

            const searchSchemaStub = sandbox.stub(schemaClient, 'searchSchemas')
            searchSchemaStub
                .withArgs('randomText', TEST_REGISTRY)
                .returns(asyncGenerator(searchSummaryList1))
                .onCall(0)
            searchSchemaStub
                .withArgs('randomText', TEST_REGISTRY2)
                .returns(asyncGenerator(searchSummaryList2))
                .onCall(1)
            const results = await getSearchResults(
                schemaClient,
                [TEST_REGISTRY, TEST_REGISTRY2, FAIL_REGISTRY, FAIL_REGISTRY2],
                'randomText'
            )

            assert.strictEqual(results.length, 3, 'should return 3 summaries')

            //results are unordered, sort for testing purposes
            results.sort(function(a, b) {
                return a.RegistryName > b.RegistryName ? 1 : b.RegistryName > a.RegistryName ? -1 : 0
            })
            const expectedTitle1 = TEST_REGISTRY.concat('/', searchSummary1.SchemaName!)
            const expectedTitle2 = TEST_REGISTRY.concat('/', searchSummary2.SchemaName!)
            const expectedTitle3 = TEST_REGISTRY2.concat('/', searchSummary3.SchemaName!)

            assert.strictEqual(results[0].RegistryName, TEST_REGISTRY, 'sumnmary should belong to requested registry')
            assert.strictEqual(results[1].RegistryName, TEST_REGISTRY, 'sumnmary should belong to requested registry')
            assert.strictEqual(results[2].RegistryName, TEST_REGISTRY2, 'sumnmary should belong to requested registry')

            assert.strictEqual(results[0].Title, expectedTitle1, 'title should be prefixed with registryName')
            assert.strictEqual(results[1].Title, expectedTitle2, 'title should be prefixed with registryName')
            assert.strictEqual(results[2].Title, expectedTitle3, 'title should be prefixed with registryName')

            assert.strictEqual(results[0].VersionList.length, 2, 'first summary has 2 versions')
            assert.strictEqual(results[1].VersionList.length, 1, 'second summary has 1 version')
            assert.strictEqual(results[2].VersionList.length, 1, 'third summary has 1 version')

            //failed registries
            assert.strictEqual(vscodeSpy.callCount, 2, 'should display 2 error message, 1 per each failed registry')
            assert.strictEqual(vscodeSpy.firstCall.lastArg, displayMessage, 'should display correct error message')
            assert.strictEqual(vscodeSpy.secondCall.lastArg, displayMessage2, 'should display correct error message')
        })
    })

    describe('createMessageReceivedFunc', () => {
        let postMessageSpy: sinon.SinonSpy<[any], Thenable<boolean>>
        beforeEach(() => {
            postMessageSpy = sandbox.spy(onPostMessage)
        })

        const mockTelemetryService = ({
            record: () => {},
        } as any) as TelemetryService

        const singleRegistryName = [TEST_REGISTRY]
        const multipleRegistryNames = [TEST_REGISTRY, TEST_REGISTRY2]
        const AWS_EVENT_SCHEMA_RAW =
            '{"openapi":"3.0.0","info":{"version":"1.0.0","title":"Event"},"paths":{},"components":{"schemas":{"Event":{"type":"object"}}}}'
        const schemaResponse: Schemas.DescribeSchemaResponse = {
            Content: AWS_EVENT_SCHEMA_RAW,
        }

        it('shows schema content for latest matching schema version by default', async () => {
            const versionedSummary = {
                RegistryName: TEST_REGISTRY,
                Title: getPageHeader(singleRegistryName),
                VersionList: ['3', '2', '1'],
            }
            const fakeMessage: CommandMessage = {
                command: 'fetchSchemaContent',
                version: undefined,
                schemaSummary: versionedSummary,
            }

            sandbox.stub(schemaClient, 'describeSchema').returns(Promise.resolve(schemaResponse))

            const expectedArgument1 = {
                command: 'showSchemaContent',
                results: JSON.stringify(JSON.parse(schemaResponse.Content!), undefined, getTabSizeSetting()),
                version: '3',
            }

            const expectedArgument2 = {
                command: 'setVersionsDropdown',
                results: fakeMessage.schemaSummary!.VersionList,
            }

            const returnedFunc = createMessageReceivedFunc({
                registryNames: singleRegistryName,
                schemaClient: schemaClient,
                telemetryService: mockTelemetryService,
                onPostMessage: postMessageSpy,
            })

            await returnedFunc(fakeMessage)

            assert.strictEqual(
                postMessageSpy.callCount,
                2,
                'post message should be called twice, for showingSchemaContent and setVersionsDropdown'
            )
            assert.deepStrictEqual(
                postMessageSpy.firstCall.lastArg,
                expectedArgument1,
                'should call showSchemaContent command with pretty schema and latest version 3'
            )
            assert.deepStrictEqual(
                postMessageSpy.secondCall.lastArg,
                expectedArgument2,
                'should call setVersionDropdown command with correct list of versions'
            )
        })

        it('shows schema content for user selected version', async () => {
            const versionedSummary = {
                RegistryName: TEST_REGISTRY,
                Title: getPageHeader(multipleRegistryNames),
                VersionList: ['1'],
            }
            const fakeMessage: CommandMessage = {
                command: 'fetchSchemaContent',
                version: '1',
                schemaSummary: versionedSummary,
            }

            sandbox.stub(schemaClient, 'describeSchema').returns(Promise.resolve(schemaResponse))

            const expectedArgument = {
                command: 'showSchemaContent',
                results: JSON.stringify(JSON.parse(schemaResponse.Content!), undefined, getTabSizeSetting()),
                version: '1',
            }

            const returnedFunc = createMessageReceivedFunc({
                registryNames: multipleRegistryNames,
                schemaClient: schemaClient,
                telemetryService: mockTelemetryService,
                onPostMessage: postMessageSpy,
            })

            await returnedFunc(fakeMessage)

            assert.strictEqual(
                postMessageSpy.callCount,
                1,
                'post message should be called once since the user has selected version'
            )
            assert.deepStrictEqual(
                postMessageSpy.firstCall.lastArg,
                expectedArgument,
                'should call showSchemaContent command with pretty schema and latest version 1'
            )
        })

        it('shows schema list when user makes a search', async () => {
            const fakeMessage: CommandMessage = { command: 'searchSchemas', keyword: 'searchText' }

            const expectResults1 = {
                RegistryName: TEST_REGISTRY,
                Title: TEST_REGISTRY + '/testSchema1',
                VersionList: ['2', '1'],
            }
            const expectResults2 = {
                RegistryName: TEST_REGISTRY,
                Title: TEST_REGISTRY + '/testSchema2',
                VersionList: ['1'],
            }

            const expectedArgument = {
                command: 'showSearchSchemaList',
                results: [expectResults1, expectResults2],
                resultsNotFound: false,
            }

            const searchSummaryList = [searchSummary1, searchSummary2]
            sandbox
                .stub(schemaClient, 'searchSchemas')
                .withArgs('searchText', TEST_REGISTRY)
                .returns(asyncGenerator(searchSummaryList))

            const returnedFunc = createMessageReceivedFunc({
                registryNames: multipleRegistryNames,
                schemaClient: schemaClient,
                telemetryService: mockTelemetryService,
                onPostMessage: postMessageSpy,
            })

            await returnedFunc(fakeMessage)

            assert.strictEqual(postMessageSpy.callCount, 1, 'postMessage should call showSearchSchemaList command')
            assert.deepStrictEqual(
                postMessageSpy.firstCall.lastArg,
                expectedArgument,
                'postMessage should have correct results'
            )
        })

        it('throws an error for an invalid command message', async () => {
            const fakeMessage: CommandMessage = { command: 'invalidCommand' }
            const errorMessage = `Search webview command ${fakeMessage.command} is invalid`
            const returnedFunc = createMessageReceivedFunc({
                registryNames: multipleRegistryNames,
                schemaClient: schemaClient,
                telemetryService: mockTelemetryService,
                onPostMessage: postMessageSpy,
            })

            const error = await assertThrowsError(async () => returnedFunc(fakeMessage))

            assert.strictEqual(error.message, errorMessage, 'Should fail for invalidCommand')
        })

        function onPostMessage(message: any): Thenable<boolean> {
            if (message) {
                return Promise.resolve(true)
            }

            return Promise.resolve(false)
        }
    })

    describe('getRegistryNameList', () => {
        it('should return list with single registry name for registryItemNode', async () => {
            const fakeRegistryNew = {
                RegistryName: TEST_REGISTRY,
                RegistryArn: 'arn:aws:schemas:us-west-2:19930409:registry/testRegistry',
            }

            const registryItemNode = new RegistryItemNode(fakeRegion, fakeRegistryNew)

            const result = await getRegistryNames(registryItemNode, schemaClient)
            assert.deepStrictEqual(result, [TEST_REGISTRY], 'should have a single registry name in it')
        })

        it('should return list with multiple registry names for schemasNode', async () => {
            const schemasNode = new SchemasNode(fakeRegion)
            const registrySummary1 = { RegistryArn: 'arn:aws:registry/' + TEST_REGISTRY, RegistryName: TEST_REGISTRY }
            const registrySummary2 = { RegistryArn: 'arn:aws:registry/' + TEST_REGISTRY2, RegistryName: TEST_REGISTRY2 }

            sandbox.stub(schemaClient, 'listRegistries').returns(asyncGenerator([registrySummary1, registrySummary2]))

            const result = await getRegistryNames(schemasNode, schemaClient)
            assert.deepStrictEqual(result, [TEST_REGISTRY, TEST_REGISTRY2], 'should have two registry names in it')
        })

        it('should return an empty list and display error message if schemas service not available in the region', async () => {
            const vscodeSpy = sandbox.spy(vscode.window, 'showErrorMessage')
            const displayMessage = 'Error loading Schemas resources'

            const schemasNode = new SchemasNode(fakeRegion)
            sandbox.stub(schemaClient, 'listRegistries')

            const results = await getRegistryNames(schemasNode, schemaClient)

            assert.ok(results.length === 0, 'Should return an empty array')
            assert.strictEqual(vscodeSpy.callCount, 1, ' error message should be shown exactly once')
            assert.strictEqual(vscodeSpy.firstCall.lastArg, displayMessage, 'should display correct error message')
        })
    })
})
