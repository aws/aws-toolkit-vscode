/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { deleteCertCommand } from '../../../iot/commands/deleteCert'
import { IotCertWithPoliciesNode } from '../../../iot/explorer/iotCertificateNode'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('deleteCertCommand', function () {
    const certificateId = 'test-cert'
    const status = 'INACTIVE'
    let iot: IotClient
    let node: IotCertWithPoliciesNode
    let parentNode: IotCertsFolderNode

    beforeEach(function () {
        iot = mock()
        parentNode = new IotCertsFolderNode(instance(iot), new IotNode(instance(iot)))
        node = new IotCertWithPoliciesNode(
            { id: certificateId, arn: 'arn', activeStatus: status, creationDate: new Date() },
            parentNode,
            instance(iot)
        )
    })

    it('confirms deletion, deletes cert, and refreshes node', async function () {
        when(iot.listThingsForCert(deepEqual({ principal: 'arn' }))).thenResolve([])
        when(iot.listPrincipalPolicies(deepEqual({ principal: 'arn' }))).thenResolve({ policies: [] })

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deleteCertCommand(node, window, commands)

        assert.strictEqual(window.message.warning, 'Are you sure you want to delete Certificate test-cert?')

        verify(iot.deleteCertificate(deepEqual({ certificateId, forceDelete: false }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('does nothing if things are attached', async function () {
        when(iot.listThingsForCert(deepEqual({ principal: 'arn' }))).thenResolve(['iot-thing'])

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deleteCertCommand(node, window, commands)

        assert.ok(window.message.error?.includes('Certificate has attached iot-thing'))

        assert.strictEqual(commands.command, undefined)
    })

    it('does nothing when deletion is cancelled', async function () {
        when(iot.listThingsForCert(deepEqual({ principal: 'arn' }))).thenResolve([])
        const window = new FakeWindow({ message: { warningSelection: 'Cancel' } })
        await deleteCertCommand(node, window, new FakeCommands())

        verify(iot.deleteCertificate(anything())).never()
    })

    it('does nothing if certificate is active', async function () {
        node = new IotCertWithPoliciesNode(
            { id: certificateId, arn: 'arn', activeStatus: 'ACTIVE', creationDate: new Date() },
            parentNode,
            instance(iot)
        )
        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        await deleteCertCommand(node, window, new FakeCommands())

        verify(iot.deleteCertificate(anything())).never()
    })

    it('shows an error message and refreshes node when certificate deletion fails', async function () {
        when(iot.listThingsForCert(deepEqual({ principal: 'arn' }))).thenResolve([])
        when(iot.listPrincipalPolicies(deepEqual({ principal: 'arn' }))).thenResolve({ policies: [] })
        when(iot.deleteCertificate(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deleteCertCommand(node, window, commands)

        assert.ok(window.message.error?.includes('Failed to delete Certificate test-cert'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('shows an error message if Things are not fetched', async function () {
        when(iot.listThingsForCert(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deleteCertCommand(node, window, commands)

        verify(iot.deleteCertificate(anything())).never()

        assert.ok(window.message.error?.includes('Failed to retrieve Things attached to certificate'))

        assert.strictEqual(commands.command, undefined)
    })

    it('confirms force deletion if policies are attached', async function () {
        when(iot.listThingsForCert(deepEqual({ principal: 'arn' }))).thenResolve([])
        when(iot.listPrincipalPolicies(deepEqual({ principal: 'arn' }))).thenResolve({
            policies: [{ policyName: 'policy' }],
        })

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deleteCertCommand(node, window, commands)

        assert.strictEqual(window.message.warning, 'Certificate has attached policies. Delete anyway?')

        verify(iot.deleteCertificate(deepEqual({ certificateId, forceDelete: true }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('shows an error message but refreshes node if policies are not fetched', async function () {
        when(iot.listThingsForCert(deepEqual({ principal: 'arn' }))).thenResolve([])
        when(iot.listPrincipalPolicies(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deleteCertCommand(node, window, commands)

        assert.strictEqual(window.message.error, 'Failed to retrieve policies attached to certificate')
        verify(iot.deleteCertificate(deepEqual({ certificateId, forceDelete: false }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })
})
