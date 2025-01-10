/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { getTestWindow } from '../../shared/vscode/window'
import { DocumentDBClient, DBStorageType } from '../../../shared/clients/docdbClient'
import { DBClusterNode } from '../../../docdb/explorer/dbClusterNode'
import { createInstance } from '../../../docdb/commands/createInstance'
import { CreateDBInstanceMessage, DBCluster } from '@aws-sdk/client-docdb'
import { DocumentDBNode } from '../../../docdb/explorer/docdbNode'
import { assertTelemetry } from '../../testUtil'

describe('createInstanceCommand', function () {
    const clusterName = 'docdb-1234'
    const instanceName = 'test-instance'
    let docdb: DocumentDBClient
    let cluster: DBCluster
    let node: DBClusterNode
    let spyExecuteCommand: sinon.SinonSpy
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        docdb = { regionCode: 'us-east-1' } as DocumentDBClient

        docdb.listInstances = sinon.stub().resolves([])

        docdb.listInstanceClassOptions = sinon
            .stub()
            .resolves([{ DBInstanceClass: 'db.t3.medium', StorageType: DBStorageType.Standard }])

        cluster = { DBClusterIdentifier: clusterName, Status: 'available' }
        const parentNode = new DocumentDBNode(docdb)
        node = new DBClusterNode(parentNode, cluster, docdb)
    })

    afterEach(function () {
        sandbox.restore()
        getTestWindow().dispose()
    })
    function setupWizard() {
        getTestWindow().onDidShowInputBox((input) => {
            input.acceptValue(instanceName)
        })

        getTestWindow().onDidShowQuickPick(async (picker) => {
            await picker.untilReady()
            picker.acceptItem(picker.items[0])
        })
    }

    it('prompts for instance name and instance class, creates instance, shows success, and refreshes node', async function () {
        // arrange
        const stub = sinon.stub().resolves({
            DBInstanceIdentifier: instanceName,
        })
        docdb.createInstance = stub
        setupWizard()

        // act
        await createInstance(node)

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Creating instance: test-instance/)

        const expectedArgs: CreateDBInstanceMessage = {
            Engine: 'docdb',
            DBClusterIdentifier: clusterName,
            DBInstanceIdentifier: instanceName,
            DBInstanceClass: 'db.t3.medium',
        }

        assert(stub.calledOnceWithExactly(expectedArgs))
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node)
        assert((docdb.listInstances as sinon.SinonSpy).calledOnce)

        assertTelemetry('docdb_createInstance', {
            result: 'Succeeded',
        })
    })

    it('does nothing when prompt is cancelled', async function () {
        // arrange
        const stub = sinon.stub()
        docdb.createInstance = stub
        getTestWindow().onDidShowInputBox((input) => input.hide())

        // act
        await assert.rejects(createInstance(node))

        // assert
        assert(stub.notCalled)

        assertTelemetry('docdb_createInstance', {
            result: 'Cancelled',
        })
    })

    it('shows a warning when the cluster has the max number of instances', async function () {
        // arrange
        docdb.listInstances = sinon.stub().resolves(new Array(16))
        const stub = sinon.stub()
        docdb.createInstance = stub
        setupWizard()

        // act
        await assert.rejects(createInstance(node))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertMessage(/Max instances in use/)

        assertTelemetry('docdb_createInstance', {
            result: 'Failed',
        })
    })

    it('shows an error when instance creation fails', async function () {
        // arrange
        const stub = sinon.stub().rejects()
        docdb.createInstance = stub
        setupWizard()

        // act
        await assert.rejects(createInstance(node))

        // assert
        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create instance: test-instance/)

        assertTelemetry('docdb_createInstance', {
            result: 'Failed',
        })
    })
})
