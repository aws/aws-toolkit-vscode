/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { getTestWindow } from '../../shared/vscode/window'
import { DBCluster } from '@aws-sdk/client-docdb'
import { DocumentDBClient, DBInstance } from '../../../shared/clients/docdbClient'
import { DBClusterNode } from '../../../docdb/explorer/dbClusterNode'
import { DBInstanceNode } from '../../../docdb/explorer/dbInstanceNode'
import { DocumentDBNode } from '../../../docdb/explorer/docdbNode'
import { renameInstance } from '../../../docdb/commands/renameInstance'
import { assertTelemetry } from '../../testUtil'

describe('renameInstanceCommand', function () {
    const clusterName = 'docdb-1234'
    const instanceName = 'test-instance'
    const newInstanceName = 'new-instance-name'
    let docdb: DocumentDBClient
    let cluster: DBCluster
    let instance: DBInstance
    let node: DBInstanceNode
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        docdb = { regionCode: 'us-east-1' } as DocumentDBClient
        cluster = { DBClusterIdentifier: clusterName, Status: 'available' }
        instance = {
            DBInstanceIdentifier: instanceName,
            DBClusterIdentifier: clusterName,
            DBInstanceStatus: 'available',
        }
        const parentNode = new DBClusterNode(new DocumentDBNode(docdb), cluster, docdb)
        node = new DBInstanceNode(parentNode, instance)
    })

    afterEach(function () {
        sandbox.restore()
        getTestWindow().dispose()
    })

    function setupWizard() {
        getTestWindow().onDidShowInputBox((input) => {
            input.acceptValue(newInstanceName)
        })
    }

    it('prompts for new instance name, modifies instance, shows success, and refreshes node', async function () {
        // arrange
        const stub = sinon.stub().resolves({
            DBInstanceIdentifier: instanceName,
        })
        docdb.modifyInstance = stub
        setupWizard()

        // act
        await renameInstance(node)

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Updated instance: test-instance/)

        const expectedArgs = {
            DBInstanceIdentifier: instanceName,
            NewDBInstanceIdentifier: newInstanceName,
            ApplyImmediately: true,
        }

        assert(stub.calledOnceWithExactly(expectedArgs))
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node)

        assertTelemetry('docdb_renameInstance', {
            result: 'Succeeded',
        })
    })

    it('does nothing when prompt is cancelled', async function () {
        // arrange
        const stub = sinon.stub()
        docdb.modifyInstance = stub
        getTestWindow().onDidShowInputBox((input) => input.hide())

        // act
        await assert.rejects(renameInstance(node))

        // assert
        assert(stub.notCalled)

        assertTelemetry('docdb_renameInstance', {
            result: 'Cancelled',
        })
    })

    it('shows a warning when the instance is not available', async function () {
        // arrange
        instance.DBInstanceStatus = 'stopped'
        const stub = sinon.stub()
        docdb.modifyInstance = stub
        setupWizard()

        // act
        await assert.rejects(renameInstance(node))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertMessage(/Instance must be running/)

        assertTelemetry('docdb_renameInstance', {
            result: 'Cancelled',
        })
    })

    it('shows an error when instance creation fails', async function () {
        // arrange
        const stub = sinon.stub().rejects()
        docdb.modifyInstance = stub
        setupWizard()

        // act
        await assert.rejects(renameInstance(node))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to rename instance: test-instance/)

        assertTelemetry('docdb_renameInstance', {
            result: 'Failed',
        })
    })
})
