/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { createFederatedConnectionNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/federatedConnectionStrategy'
import { GlueClient, ListEntitiesCommand, DescribeEntityCommand } from '@aws-sdk/client-glue'
import { ConnectionCredentialsProvider } from '../../../../sagemakerunifiedstudio/auth/providers/connectionCredentialsProvider'

describe('FederatedConnectionStrategy', function () {
    let sandbox: sinon.SinonSandbox
    let mockGlueClient: sinon.SinonStubbedInstance<GlueClient>
    let mockCredentialsProvider: ConnectionCredentialsProvider

    const mockConnection = {
        connectionId: 'federated-conn-123',
        name: 'test-federated-connection',
        glueConnectionName: 'test-glue-connection',
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        mockCredentialsProvider = {
            getCredentials: sandbox.stub().resolves({
                accessKeyId: 'test-key',
                secretAccessKey: 'test-secret',
            }),
            logger: {} as any,
            smusAuthProvider: {} as any,
            connectionId: 'test-connection',
            projectId: 'test-project',
        } as any

        mockGlueClient = sandbox.createStubInstance(GlueClient)
        sandbox.stub(GlueClient.prototype, 'send').callsFake(mockGlueClient.send)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('createFederatedConnectionNode', function () {
        it('should create connection node with correct properties', async function () {
            const node = await createFederatedConnectionNode(
                mockConnection as any,
                mockCredentialsProvider,
                'us-east-1'
            )

            assert.strictEqual(node.id, 'federated-federated-conn-123')
            assert.strictEqual(node.resource, mockConnection)

            const treeItem = await node.getTreeItem()
            assert.strictEqual(treeItem.label, 'test-federated-connection')
            assert.strictEqual(treeItem.contextValue, 'federatedConnection')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
        })

        it('should return error when no glue connection name', async function () {
            const connectionWithoutGlue = { ...mockConnection, glueConnectionName: undefined }

            const node = await createFederatedConnectionNode(
                connectionWithoutGlue as any,
                mockCredentialsProvider,
                'us-east-1'
            )

            const children = await node.getChildren!()
            assert.strictEqual(children.length, 1)
            assert.ok(children[0].id.includes('error'))
        })

        it('should return placeholder when no entities found', async function () {
            mockGlueClient.send.resolves({ Entities: [] })

            const node = await createFederatedConnectionNode(
                mockConnection as any,
                mockCredentialsProvider,
                'us-east-1'
            )

            const children = await node.getChildren!()
            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].resource, '[No data found]')
        })

        it('should group tables under Tables container', async function () {
            mockGlueClient.send.resolves({
                Entities: [
                    { EntityName: 'table1', Category: 'TABLE', Label: 'Table 1' },
                    { EntityName: 'table2', Category: 'TABLE', Label: 'Table 2' },
                ],
            })

            const node = await createFederatedConnectionNode(
                mockConnection as any,
                mockCredentialsProvider,
                'us-east-1'
            )

            const children = await node.getChildren!()
            assert.strictEqual(children.length, 1)

            const tablesContainer = children[0]
            assert.ok(tablesContainer.id.includes('tables'))

            const tableChildren = await tablesContainer.getChildren!()
            assert.strictEqual(tableChildren.length, 2)
        })

        it('should handle mixed entity types correctly', async function () {
            mockGlueClient.send.resolves({
                Entities: [
                    { EntityName: 'schema1', Category: 'SCHEMA', Label: 'Schema 1' },
                    { EntityName: 'table1', Category: 'TABLE', Label: 'Table 1' },
                ],
            })

            const node = await createFederatedConnectionNode(
                mockConnection as any,
                mockCredentialsProvider,
                'us-east-1'
            )

            const children = await node.getChildren!()
            assert.strictEqual(children.length, 2) // schema + tables container
        })

        it('should handle table columns', async function () {
            const mockEntity = { EntityName: 'test-table', Category: 'TABLE' }

            mockGlueClient.send.callsFake((command) => {
                if (command instanceof DescribeEntityCommand) {
                    return Promise.resolve({
                        Fields: [
                            { FieldName: 'col1', FieldType: 'string', Label: 'Column 1' },
                            { FieldName: 'col2', FieldType: 'int', Label: 'Column 2' },
                        ],
                    })
                }
                if (command instanceof ListEntitiesCommand) {
                    return Promise.resolve({
                        Entities: [mockEntity],
                    })
                }
                return Promise.resolve({})
            })

            const node = await createFederatedConnectionNode(
                mockConnection as any,
                mockCredentialsProvider,
                'us-east-1'
            )

            const children = await node.getChildren!()
            const tablesContainer = children[0]
            const tableNodes = await tablesContainer.getChildren!()
            const tableNode = tableNodes[0]

            const columns = await tableNode.getChildren!()
            assert.strictEqual(columns.length, 2)

            const columnTreeItem = await columns[0].getTreeItem()
            assert.strictEqual(columnTreeItem.description, 'string')
        })

        it('should handle API errors gracefully', async function () {
            mockGlueClient.send.rejects(new Error('API Error'))

            const node = await createFederatedConnectionNode(
                mockConnection as any,
                mockCredentialsProvider,
                'us-east-1'
            )

            const children = await node.getChildren!()
            assert.strictEqual(children.length, 1)
            assert.ok(children[0].id.includes('error'))
        })
    })
})
