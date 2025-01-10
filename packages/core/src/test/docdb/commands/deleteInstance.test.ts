/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { getTestWindow } from '../../shared/vscode/window'
import { DocumentDBClient } from '../../../shared/clients/docdbClient'
import { DBClusterNode } from '../../../docdb/explorer/dbClusterNode'
import { DBInstanceNode } from '../../../docdb/explorer/dbInstanceNode'
import { deleteInstance } from '../../../docdb/commands/deleteInstance'
import { DBCluster, DBInstance } from '@aws-sdk/client-docdb'
import { assertTelemetry } from '../../testUtil'

describe('deleteInstanceCommand', function () {
    const instanceName = 'test-instance'
    let docdb: DocumentDBClient
    let cluster: DBCluster
    let instance: DBInstance
    let parentNode: DBClusterNode
    let node: DBInstanceNode
    let spyExecuteCommand: sinon.SinonSpy
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')
        docdb = { regionCode: 'us-east-1' } as DocumentDBClient
        cluster = { Status: 'available' }
        instance = {
            DBInstanceIdentifier: instanceName,
            DBClusterIdentifier: 'test-cluster',
            DBInstanceStatus: 'available',
        }
        parentNode = new DBClusterNode(undefined!, cluster, docdb)
        node = new DBInstanceNode(parentNode, instance)
    })
    afterEach(function () {
        sandbox.restore()
        getTestWindow().dispose()
    })
    function setupWizard() {
        getTestWindow().onDidShowInputBox((input) => {
            input.acceptValue(instanceName)
        })
    }

    it('prompts for instance name, deletes instance, shows success, and refreshes node', async function () {
        // arrange
        const stub = sinon.stub().resolves({
            DBInstanceIdentifier: instanceName,
        })
        docdb.deleteInstance = stub
        setupWizard()

        // act
        await deleteInstance(node)

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Deleting instance: test-instance/)

        assert(stub.calledOnceWithExactly({ DBInstanceIdentifier: instanceName }))
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)

        assertTelemetry('docdb_deleteInstance', {
            result: 'Succeeded',
        })
    })

    it('does nothing when prompt is cancelled', async function () {
        // arrange
        const stub = sinon.stub()
        docdb.deleteInstance = stub
        getTestWindow().onDidShowInputBox((input) => input.hide())

        // act
        await assert.rejects(deleteInstance(node))

        // assert
        assert(stub.notCalled)

        assertTelemetry('docdb_deleteInstance', {
            result: 'Cancelled',
        })
    })

    it('shows a warning when the cluster is stopped', async function () {
        // arrange
        cluster.Status = 'stopped'
        const stub = sinon.stub()
        docdb.deleteInstance = stub
        setupWizard()

        // act
        await assert.rejects(deleteInstance(node))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertMessage(/Cluster must be started to delete instances/)

        assertTelemetry('docdb_deleteInstance', {
            result: 'Cancelled',
        })
    })

    it('shows an error when instance deletion fails', async function () {
        // arrange
        const stub = sinon.stub().rejects()
        docdb.deleteInstance = stub
        setupWizard()

        // act
        await assert.rejects(deleteInstance(node))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to delete instance: test-instance/)

        assertTelemetry('docdb_deleteInstance', {
            result: 'Failed',
        })
    })
})
