/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { getTestWindow } from '../../shared/vscode/window'
import { DocumentDBClient, DBInstance, DBStorageType } from '../../../shared/clients/docdbClient'
import { DBClusterNode } from '../../../docdb/explorer/dbClusterNode'
import { modifyInstance } from '../../../docdb/commands/modifyInstance'
import { ModifyDBInstanceMessage, DBCluster } from '@aws-sdk/client-docdb'
import { DocumentDBNode } from '../../../docdb/explorer/docdbNode'
import { DBInstanceNode } from '../../../docdb/explorer/dbInstanceNode'
import { assertTelemetry } from '../../testUtil'

describe('modifyInstanceCommand', function () {
    const clusterName = 'docdb-1234'
    const instanceName = 'test-instance'
    let docdb: DocumentDBClient
    let cluster: DBCluster
    let instance: DBInstance
    let node: DBInstanceNode
    let spyExecuteCommand: sinon.SinonSpy
    let sandbox: sinon.SinonSandbox
    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')
        docdb = { regionCode: 'us-east-1' } as DocumentDBClient
        docdb.listInstanceClassOptions = sinon
            .stub()
            .resolves([{ DBInstanceClass: 'db.t3.large', StorageType: DBStorageType.Standard }])

        cluster = { DBClusterIdentifier: clusterName, Status: 'available' }
        instance = {
            DBInstanceIdentifier: instanceName,
            DBClusterIdentifier: clusterName,
            DBInstanceStatus: 'available',
        }
        const parentNode = new DBClusterNode(new DocumentDBNode(docdb), cluster, docdb)
        node = new DBInstanceNode(parentNode, instance)
        node.waitUntilStatusChanged = sinon.stub().resolves(true)
    })

    afterEach(function () {
        sandbox.restore()
        getTestWindow().dispose()
    })

    function setupWizard() {
        getTestWindow().onDidShowQuickPick(async (picker) => {
            await picker.untilReady()
            picker.acceptItem(picker.items[0])
        })
    }

    it('prompts for instance class, modifies instance, shows success, and refreshes node', async function () {
        // arrange
        const stub = sinon.stub().resolves({
            DBInstanceIdentifier: instanceName,
        })
        docdb.modifyInstance = stub
        setupWizard()

        // act
        await modifyInstance(node)

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Modified instance: test-instance/)

        const expectedArgs: ModifyDBInstanceMessage = {
            DBInstanceIdentifier: instanceName,
            DBInstanceClass: 'db.t3.large',
            ApplyImmediately: true,
        }

        assert(stub.calledOnceWithExactly(expectedArgs))
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node.parent)

        assertTelemetry('docdb_resizeInstance', {
            result: 'Succeeded',
        })
    })

    it('does nothing when prompt is cancelled', async function () {
        // arrange
        const stub = sinon.stub()
        docdb.modifyInstance = stub
        getTestWindow().onDidShowQuickPick((picker) => picker.hide())

        // act
        await assert.rejects(modifyInstance(node))

        // assert
        assert(stub.notCalled)

        assertTelemetry('docdb_resizeInstance', {
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
        await assert.rejects(modifyInstance(node))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertMessage(/Instance must be running/)

        assertTelemetry('docdb_resizeInstance', {
            result: 'Cancelled',
        })
    })

    it('shows an error when instance creation fails', async function () {
        // arrange
        const stub = sinon.stub().rejects()
        docdb.modifyInstance = stub
        setupWizard()

        // act
        await assert.rejects(modifyInstance(node))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to modify instance: test-instance/)

        assertTelemetry('docdb_resizeInstance', {
            result: 'Failed',
        })
    })
})
