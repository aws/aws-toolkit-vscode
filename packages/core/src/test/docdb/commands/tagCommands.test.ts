/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { assertTelemetry } from '../../testUtil'
import { getTestWindow } from '../../shared/vscode/window'
import { DocumentDBClient, DBInstance } from '../../../shared/clients/docdbClient'
import { DBClusterNode } from '../../../docdb/explorer/dbClusterNode'
import { DBInstanceNode } from '../../../docdb/explorer/dbInstanceNode'
import { DocumentDBNode } from '../../../docdb/explorer/docdbNode'
import { addTag, listTags, removeTag } from '../../../docdb/commands/tagCommands'

describe('Tags', function () {
    const instanceName = 'test-instance'
    let docdb: DocumentDBClient
    let instance: DBInstance
    let node: DBInstanceNode
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        docdb = { regionCode: 'us-east-1' } as DocumentDBClient
        const clusterName = 'docdb-1234'
        const cluster = { DBClusterIdentifier: clusterName, Status: 'available' }
        const parentNode = new DBClusterNode(new DocumentDBNode(docdb), cluster, docdb)
        instance = {
            DBInstanceIdentifier: instanceName,
            DBInstanceArn: 'arn:' + instanceName,
            DBClusterIdentifier: clusterName,
        }
        node = new DBInstanceNode(parentNode, instance)
    })

    afterEach(function () {
        sandbox.restore()
        getTestWindow().dispose()
    })

    describe('listTagsCommand', function () {
        it('displays a list of resource tags', async function () {
            // arrange
            const stub = sinon.stub().resolves({})
            docdb.listResourceTags = stub
            getTestWindow().onDidShowMessage((message) => {
                assert.equal(message.message, 'Tags for test-instance:')
                message.close()
            })

            // act
            await listTags(node)

            // assert
            assert(stub.calledOnceWithExactly(node.arn))
            assertTelemetry('docdb_listTags', { result: 'Succeeded' })
        })

        it('shows an error when api returns failure', async function () {
            // arrange
            const stub = sinon.stub().rejects()
            docdb.listResourceTags = stub

            // act
            await assert.rejects(listTags(node))

            // assert
            assertTelemetry('docdb_listTags', { result: 'Failed' })
        })
    })

    describe('addTagCommand', function () {
        it('prompts for a new tag key/value and adds the tag', async function () {
            // arrange
            const stub = sinon.stub().resolves()
            docdb.addResourceTags = stub
            getTestWindow().onDidShowInputBox((input) => input.acceptValue('test-value'))

            // act
            await addTag(node)

            // assert
            assert(stub.calledOnce)
            getTestWindow().getFirstMessage().assertInfo('Tag added')
            assertTelemetry('docdb_addTag', { result: 'Succeeded' })
        })

        it('does nothing when prompt is cancelled', async function () {
            // arrange
            const stub = sinon.stub().resolves()
            docdb.addResourceTags = stub
            getTestWindow().onDidShowInputBox((input) => input.hide())

            // act
            await assert.rejects(addTag(node))

            // assert
            assert(stub.notCalled)
            assertTelemetry('docdb_addTag', { result: 'Cancelled' })
        })

        it('shows an error when api returns failure', async function () {
            // arrange
            const stub = sinon.stub().rejects()
            docdb.addResourceTags = stub
            getTestWindow().onDidShowInputBox((input) => input.acceptValue('test-value'))

            // act
            await assert.rejects(addTag(node))

            // assert
            assertTelemetry('docdb_addTag', { result: 'Failed' })
        })
    })

    describe('removeTagCommand', function () {
        it('prompts with a list of tags and removes the selected tag', async function () {
            // arrange
            const tag = { ['test-key']: 'test-value ' }
            docdb.listResourceTags = sinon.stub().resolves(tag)
            const stub = sinon.stub().resolves()
            docdb.removeResourceTags = stub
            getTestWindow().onDidShowQuickPick((picker) => picker.acceptItem(picker.items[0]))

            // act
            await removeTag(node)

            // assert
            assert(stub.calledOnce)
            getTestWindow().getFirstMessage().assertInfo('Tag removed')
            assertTelemetry('docdb_removeTag', { result: 'Succeeded' })
        })

        it('does nothing when prompt is cancelled', async function () {
            // arrange
            const tag = { ['test-key']: 'test-value ' }
            docdb.listResourceTags = sinon.stub().resolves(tag)
            const stub = sinon.stub().resolves()
            docdb.removeResourceTags = stub
            getTestWindow().onDidShowQuickPick((picker) => picker.hide())

            // act
            await assert.rejects(removeTag(node))

            // assert
            assert(stub.notCalled)
            assertTelemetry('docdb_removeTag', { result: 'Cancelled' })
        })

        it('shows an error when api returns failure', async function () {
            // arrange
            const stub = sinon.stub().rejects()
            docdb.listResourceTags = stub
            docdb.removeResourceTags = stub
            getTestWindow().onDidShowQuickPick((picker) => picker.acceptItem(picker.items[0]))

            // act
            await assert.rejects(removeTag(node))

            // assert
            assertTelemetry('docdb_removeTag', { result: 'Failed' })
        })
    })
})
