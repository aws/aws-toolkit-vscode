/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { SageMakerUnifiedStudioAuthInfoNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioAuthInfoNode'
import { SmusAuthenticationProvider } from '../../../../sagemakerunifiedstudio/auth/providers/smusAuthenticationProvider'
import { SmusConnection, SmusSsoConnection } from '../../../../sagemakerunifiedstudio/auth/model'

describe('SageMakerUnifiedStudioAuthInfoNode', function () {
    let authInfoNode: SageMakerUnifiedStudioAuthInfoNode
    let mockAuthProvider: any
    let mockConnection: SmusSsoConnection
    let currentActiveConnection: SmusConnection | undefined

    beforeEach(function () {
        mockConnection = {
            id: 'test-connection-id',
            type: 'sso',
            startUrl: 'https://identitycenter.amazonaws.com/ssoins-testInstanceId',
            ssoRegion: 'us-east-2',
            scopes: ['datazone:domain:access'],
            label: 'Test SMUS Connection',
            domainUrl: 'https://dzd_domainId.sagemaker.us-east-2.on.aws',
            domainId: 'dzd_domainId',
            // Mock the required methods from SsoConnection
            getToken: sinon.stub().resolves(),
            getRegistration: sinon.stub().resolves(),
        } as any

        // Initialize the current active connection
        currentActiveConnection = mockConnection

        // Create mock auth provider with getter for activeConnection
        mockAuthProvider = {
            isConnected: sinon.stub().returns(true),
            isConnectionValid: sinon.stub().returns(true),
            onDidChange: sinon.stub().callsFake((listener: () => void) => ({ dispose: sinon.stub() })),
            getDomainId: sinon.stub().callsFake(() => {
                return currentActiveConnection?.domainId
            }),
            getDomainRegion: sinon.stub().callsFake(() => {
                if (currentActiveConnection?.type === 'sso') {
                    return (currentActiveConnection as any).ssoRegion
                } else if (currentActiveConnection?.type === 'iam') {
                    return (currentActiveConnection as any).region
                }
                return undefined
            }),
            get activeConnection() {
                return currentActiveConnection
            },
            set activeConnection(value: SmusConnection | undefined) {
                currentActiveConnection = value
            },
        }

        // Stub SmusAuthenticationProvider.fromContext
        sinon.stub(SmusAuthenticationProvider, 'fromContext').returns(mockAuthProvider as any)

        authInfoNode = new SageMakerUnifiedStudioAuthInfoNode()
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('constructor', function () {
        it('should initialize with correct properties', function () {
            assert.strictEqual(authInfoNode.id, 'smusAuthInfoNode')
            assert.strictEqual(authInfoNode.resource, authInfoNode)
        })

        it('should register for auth provider changes', function () {
            assert.ok(mockAuthProvider.onDidChange.called)
        })

        it('should have onDidChangeTreeItem event', function () {
            assert.ok(typeof authInfoNode.onDidChangeTreeItem === 'function')
        })
    })

    describe('getTreeItem', function () {
        describe('when connected and valid', function () {
            beforeEach(function () {
                mockAuthProvider.isConnected.returns(true)
                mockAuthProvider.isConnectionValid.returns(true)
                mockAuthProvider.activeConnection = mockConnection
            })

            it('should return connected tree item', function () {
                const treeItem = authInfoNode.getTreeItem()

                assert.strictEqual(treeItem.label, 'Domain: dzd_domainId')
                assert.strictEqual(treeItem.description, 'us-east-2')
                assert.strictEqual(treeItem.contextValue, 'smusAuthInfo')
                assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)

                // Check icon
                assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon)
                assert.strictEqual((treeItem.iconPath as vscode.ThemeIcon).id, 'key')

                // Check tooltip
                const tooltip = treeItem.tooltip as string
                assert.ok(tooltip?.includes('Connected to SageMaker Unified Studio'))
                assert.ok(tooltip?.includes('dzd_domainId'))
                assert.ok(tooltip?.includes('us-east-2'))
                assert.ok(tooltip?.includes('Status: Connected'))

                // Should not have command when valid
                assert.strictEqual(treeItem.command, undefined)
            })
        })

        describe('when connected but expired', function () {
            beforeEach(function () {
                mockAuthProvider.isConnected.returns(true)
                mockAuthProvider.isConnectionValid.returns(false)
                mockAuthProvider.activeConnection = mockConnection
            })

            it('should return expired tree item with reauthenticate command', function () {
                const treeItem = authInfoNode.getTreeItem()

                assert.strictEqual(treeItem.label, 'Domain: dzd_domainId (Expired) - Click to reauthenticate')
                assert.strictEqual(treeItem.description, 'us-east-2')
                assert.strictEqual(treeItem.contextValue, 'smusAuthInfo')

                // Check icon
                assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon)
                assert.strictEqual((treeItem.iconPath as vscode.ThemeIcon).id, 'warning')

                // Check tooltip
                const tooltip = treeItem.tooltip as string
                assert.ok(tooltip?.includes('Connection to SageMaker Unified Studio has expired'))
                assert.ok(tooltip?.includes('Status: Expired - Click to reauthenticate'))

                // Should have reauthenticate command
                assert.ok(treeItem.command)
                assert.strictEqual(treeItem.command.command, 'aws.smus.reauthenticate')
                assert.strictEqual(treeItem.command.title, 'Reauthenticate')
                assert.deepStrictEqual(treeItem.command.arguments, [mockConnection])
            })
        })

        describe('when not connected', function () {
            beforeEach(function () {
                mockAuthProvider.isConnected.returns(false)
                mockAuthProvider.isConnectionValid.returns(false)
                mockAuthProvider.activeConnection = undefined
            })

            it('should return not connected tree item', function () {
                const treeItem = authInfoNode.getTreeItem()

                assert.strictEqual(treeItem.label, 'Not Connected')
                assert.strictEqual(treeItem.description, undefined)
                assert.strictEqual(treeItem.contextValue, 'smusAuthInfo')

                // Check icon
                assert.ok(treeItem.iconPath instanceof vscode.ThemeIcon)
                assert.strictEqual((treeItem.iconPath as vscode.ThemeIcon).id, 'circle-slash')

                // Check tooltip
                const tooltip = treeItem.tooltip as string
                assert.ok(tooltip?.includes('Not connected to SageMaker Unified Studio'))
                assert.ok(tooltip?.includes('Please sign in to access your projects'))

                // Should not have command when not connected
                assert.strictEqual(treeItem.command, undefined)
            })
        })

        describe('with missing connection details', function () {
            beforeEach(function () {
                const incompleteConnection = {
                    ...mockConnection,
                    domainId: undefined,
                    ssoRegion: undefined,
                } as any

                mockAuthProvider.isConnected.returns(true)
                mockAuthProvider.isConnectionValid.returns(true)
                mockAuthProvider.activeConnection = incompleteConnection
            })

            it('should handle missing domain ID and region gracefully', function () {
                const treeItem = authInfoNode.getTreeItem()

                assert.strictEqual(treeItem.label, 'Domain: Unknown')
                assert.strictEqual(treeItem.description, 'Unknown')

                const tooltip = treeItem.tooltip as string
                assert.ok(tooltip?.includes('Domain ID: Unknown'))
                assert.ok(tooltip?.includes('Region: Unknown'))
            })
        })
    })

    describe('getParent', function () {
        it('should return undefined', function () {
            assert.strictEqual(authInfoNode.getParent(), undefined)
        })
    })

    describe('event handling', function () {
        it('should fire onDidChangeTreeItem when auth provider changes', function () {
            const eventSpy = sinon.spy()
            authInfoNode.onDidChangeTreeItem(eventSpy)

            // Simulate auth provider change
            const onDidChangeCallback = mockAuthProvider.onDidChange.firstCall.args[0]
            onDidChangeCallback()

            assert.ok(eventSpy.called)
        })

        it('should dispose event listener properly', function () {
            const disposeSpy = sinon.spy()
            mockAuthProvider.onDidChange.returns({ dispose: disposeSpy })

            // Create new node to trigger event listener registration
            new SageMakerUnifiedStudioAuthInfoNode()

            // The dispose should be available for cleanup
            assert.ok(mockAuthProvider.onDidChange.called)
        })
    })

    describe('theme icon colors', function () {
        it('should use green color for connected state', function () {
            mockAuthProvider.isConnected.returns(true)
            mockAuthProvider.isConnectionValid.returns(true)

            const treeItem = authInfoNode.getTreeItem()
            const icon = treeItem.iconPath as vscode.ThemeIcon

            assert.ok(icon.color instanceof vscode.ThemeColor)
            assert.strictEqual((icon.color as any).id, 'charts.green')
        })

        it('should use yellow color for expired state', function () {
            mockAuthProvider.isConnected.returns(true)
            mockAuthProvider.isConnectionValid.returns(false)

            const treeItem = authInfoNode.getTreeItem()
            const icon = treeItem.iconPath as vscode.ThemeIcon

            assert.ok(icon.color instanceof vscode.ThemeColor)
            assert.strictEqual((icon.color as any).id, 'charts.yellow')
        })

        it('should use red color for not connected state', function () {
            mockAuthProvider.isConnected.returns(false)

            const treeItem = authInfoNode.getTreeItem()
            const icon = treeItem.iconPath as vscode.ThemeIcon

            assert.ok(icon.color instanceof vscode.ThemeColor)
            assert.strictEqual((icon.color as any).id, 'charts.red')
        })
    })

    describe('tooltip content', function () {
        it('should include all relevant information for connected state', function () {
            mockAuthProvider.isConnected.returns(true)
            mockAuthProvider.isConnectionValid.returns(true)

            const treeItem = authInfoNode.getTreeItem()
            const tooltip = treeItem.tooltip as string

            assert.ok(tooltip.includes('Connected to SageMaker Unified Studio'))
            assert.ok(tooltip.includes(`Domain ID: ${mockConnection.domainId}`))
            assert.ok(tooltip.includes(`Region: ${mockConnection.ssoRegion}`))
            assert.ok(tooltip.includes('Status: Connected'))
        })

        it('should include expiration information for expired state', function () {
            mockAuthProvider.isConnected.returns(true)
            mockAuthProvider.isConnectionValid.returns(false)

            const treeItem = authInfoNode.getTreeItem()
            const tooltip = treeItem.tooltip as string

            assert.ok(tooltip.includes('Connection to SageMaker Unified Studio has expired'))
            assert.ok(tooltip.includes('Status: Expired - Click to reauthenticate'))
        })

        it('should include sign-in prompt for not connected state', function () {
            mockAuthProvider.isConnected.returns(false)

            const treeItem = authInfoNode.getTreeItem()
            const tooltip = treeItem.tooltip as string

            assert.ok(tooltip.includes('Not connected to SageMaker Unified Studio'))
            assert.ok(tooltip.includes('Please sign in to access your projects'))
        })
    })
})
