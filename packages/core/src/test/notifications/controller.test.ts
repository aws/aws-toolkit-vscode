/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import { NotificationsController, NotificationsNode, RuleEngine } from '../../notifications'
import * as HttpResourceFetcherModule from '../../shared/resourcefetcher/httpResourceFetcher'
import globals from '../../shared/extensionGlobals'
import { NotificationData, ToolkitNotification } from '../../notifications/types'
import { _useLocalFilesCheck } from '../../notifications/controller'
import { randomUUID } from '../../shared'
import { installFakeClock } from '../testUtil'
import * as FakeTimers from '@sinonjs/fake-timers'

describe('Notifications Controller', function () {
    const panelNode: NotificationsNode = new NotificationsNode('toolkit')
    let controller: NotificationsController
    const ruleEngine: RuleEngine = new RuleEngine({
        ideVersion: '1.83.0',
        extensionVersion: '1.20.0',
        os: 'LINUX',
        computeEnv: 'local',
        authTypes: ['builderId'],
        authRegions: ['us-east-1'],
        authStates: ['connected'],
        authScopes: ['codewhisperer:completions', 'codewhisperer:analysis'],
        installedExtensions: ['ext1', 'ext2', 'ext3'],
        activeExtensions: ['ext1', 'ext2'],
    })

    let clock: FakeTimers.InstalledClock
    let sandbox: sinon.SinonSandbox
    let getNewETagContentStub: sinon.SinonStub
    let ruleEngineSpy: sinon.SinonSpy
    let focusPanelSpy: sinon.SinonSpy
    let fetchUrl: string

    function dismissNotification(notification: ToolkitNotification) {
        // We could call `controller.dismissNotification()`, but this emulates a call
        // from actually clicking it in the view panel.
        return vscode.commands.executeCommand('_aws.toolkit.notifications.dismiss', {
            getTreeItem: () => {
                const item = new vscode.TreeItem('test')
                Object.assign(item, {
                    command: { arguments: [notification] },
                })

                return item
            },
        })
    }

    before(function () {
        assert.ok(!_useLocalFilesCheck)
        clock = installFakeClock()
    })

    beforeEach(async function () {
        panelNode.setNotifications([], [])
        controller = new NotificationsController('toolkit', panelNode)

        sandbox = sinon.createSandbox()

        getNewETagContentStub = sandbox.stub()
        ruleEngineSpy = sandbox.spy(ruleEngine, 'shouldDisplayNotification')
        focusPanelSpy = sandbox.spy(panelNode, 'focusPanel')
        sandbox.stub(HttpResourceFetcherModule, 'HttpResourceFetcher').callsFake(function (this: any, url: string) {
            fetchUrl = url
            this.getNewETagContent = getNewETagContentStub
            return this
        })

        await globals.globalState.update(controller.storageKey, {
            startUp: {} as NotificationData,
            emergency: {} as NotificationData,
            dismissed: [],
        })
    })

    afterEach(function () {
        sandbox?.restore()
        clock.reset()
    })

    after(function () {
        clock.uninstall()
    })

    it('can fetch and store startup notifications', async function () {
        const eTag = randomUUID()
        const content = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:startup1'), getInvalidTestNotification('id:startup2')],
        }
        getNewETagContentStub.resolves({
            eTag,
            content: JSON.stringify(content),
        })

        await controller.pollForStartUp(ruleEngine)

        assert.equal(getNewETagContentStub.callCount, 1)
        assert.equal(ruleEngineSpy.callCount, 2)
        assert.deepStrictEqual(ruleEngineSpy.args, [[content.notifications[0]], [content.notifications[1]]])
        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {
                payload: content,
                eTag,
            },
            emergency: {},
            dismissed: [],
        })
        assert.equal(panelNode.startUpNotifications.length, 1)
        assert.equal(panelNode.emergencyNotifications.length, 0)
        assert.deepStrictEqual(panelNode.startUpNotifications, [content.notifications[0]])
        assert.equal(panelNode.getChildren().length, 1)
        assert.equal(focusPanelSpy.callCount, 0)
    })

    it('can fetch and store emergency notifications', async function () {
        const eTag = randomUUID()
        const content = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:emergency1'), getInvalidTestNotification('id:emergency2')],
        }
        getNewETagContentStub.resolves({
            eTag,
            content: JSON.stringify(content),
        })

        await controller.pollForEmergencies(ruleEngine)

        assert.equal(getNewETagContentStub.callCount, 1)
        assert.equal(ruleEngineSpy.callCount, 2)
        assert.deepStrictEqual(ruleEngineSpy.args, [[content.notifications[0]], [content.notifications[1]]])
        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {},
            emergency: {
                payload: content,
                eTag,
            },
            dismissed: [content.notifications[0].id],
        })
        assert.equal(panelNode.startUpNotifications.length, 0)
        assert.equal(panelNode.emergencyNotifications.length, 1)
        assert.deepStrictEqual(panelNode.emergencyNotifications, [content.notifications[0]])
        assert.equal(panelNode.getChildren().length, 1)
        assert.equal(focusPanelSpy.callCount, 1)
    })

    it('can fetch and store both startup and emergency notifications', async function () {
        const eTag1 = randomUUID()
        const eTag2 = randomUUID()
        const startUpContent = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:startup1'), getInvalidTestNotification('id:startup2')],
        }
        const emergencyContent = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:emergency1'), getInvalidTestNotification('id:emergency2')],
        }
        getNewETagContentStub.callsFake(async () => {
            if (fetchUrl.includes('startup')) {
                return {
                    eTag: eTag1,
                    content: JSON.stringify(startUpContent),
                }
            } else {
                return {
                    eTag: eTag2,
                    content: JSON.stringify(emergencyContent),
                }
            }
        })

        await controller.pollForStartUp(ruleEngine)
        await controller.pollForEmergencies(ruleEngine)

        assert.equal(getNewETagContentStub.callCount, 2)

        // There are only 4 notifications in this test.
        // However, each time there is a poll, ALL notifications are evaluated for display.
        // First poll = 2 startup notifications
        // Second poll = 2 emergency notifications + 2 startup notifications from the first poll
        // = 6
        assert.equal(ruleEngineSpy.callCount, 6)

        assert.deepStrictEqual(ruleEngineSpy.args, [
            [startUpContent.notifications[0]],
            [startUpContent.notifications[1]],
            [startUpContent.notifications[0]],
            [startUpContent.notifications[1]],
            [emergencyContent.notifications[0]],
            [emergencyContent.notifications[1]],
        ])
        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {
                payload: startUpContent,
                eTag: eTag1,
            },
            emergency: {
                payload: emergencyContent,
                eTag: eTag2,
            },
            dismissed: [emergencyContent.notifications[0].id],
        })
        assert.equal(panelNode.startUpNotifications.length, 1)
        assert.equal(panelNode.emergencyNotifications.length, 1)
        assert.deepStrictEqual(panelNode.startUpNotifications, [startUpContent.notifications[0]])
        assert.deepStrictEqual(panelNode.emergencyNotifications, [emergencyContent.notifications[0]])
        assert.equal(panelNode.getChildren().length, 2)
        assert.equal(focusPanelSpy.callCount, 1)
    })

    it('dismisses a startup notification', async function () {
        const eTag = randomUUID()
        const content = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:startup1'), getValidTestNotification('id:startup2')],
        }
        getNewETagContentStub.resolves({
            eTag,
            content: JSON.stringify(content),
        })

        await controller.pollForStartUp(ruleEngine)

        assert.equal(panelNode.getChildren().length, 2)
        assert.equal(panelNode.startUpNotifications.length, 2)

        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {
                payload: content,
                eTag,
            },
            emergency: {},
            dismissed: [],
        })

        await dismissNotification(content.notifications[1])

        const actualState = await globals.globalState.get(controller.storageKey)
        assert.deepStrictEqual(actualState, {
            startUp: {
                payload: content,
                eTag,
            },
            emergency: {},
            dismissed: [content.notifications[1].id],
        })

        assert.equal(panelNode.getChildren().length, 1)
        assert.equal(panelNode.startUpNotifications.length, 1)
    })

    it('does not redisplay dismissed notifications', async function () {
        const content = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:startup1')],
        }
        getNewETagContentStub.resolves({
            eTag: '1',
            content: JSON.stringify(content),
        })

        await controller.pollForStartUp(ruleEngine)
        assert.equal(panelNode.getChildren().length, 1)

        await dismissNotification(content.notifications[0])
        assert.equal(panelNode.getChildren().length, 0)

        content.notifications.push(getValidTestNotification('id:startup2'))
        getNewETagContentStub.resolves({
            eTag: '1',
            content: JSON.stringify(content),
        })

        await controller.pollForStartUp(ruleEngine)

        const actualState = await globals.globalState.get(controller.storageKey)
        assert.deepStrictEqual(actualState, {
            startUp: {
                payload: content,
                eTag: '1',
            },
            emergency: {},
            dismissed: [content.notifications[0].id],
        })

        assert.equal(panelNode.getChildren().length, 1)
    })

    it('does not refocus emergency notifications', async function () {
        const startUpContent = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:startup1')],
        }
        const emergencyContent = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:emergency1')],
        }
        getNewETagContentStub.callsFake(async () => {
            if (fetchUrl.includes('startup')) {
                return {
                    eTag: '1',
                    content: JSON.stringify(startUpContent),
                }
            } else {
                return {
                    eTag: '1',
                    content: JSON.stringify(emergencyContent),
                }
            }
        })

        await controller.pollForEmergencies(ruleEngine)
        await controller.pollForEmergencies(ruleEngine)
        await controller.pollForStartUp(ruleEngine)

        assert.equal(getNewETagContentStub.callCount, 3)
        assert.equal(focusPanelSpy.callCount, 1)
        assert.equal(panelNode.getChildren().length, 2)
    })

    it('does not update state if eTag is not changed', async function () {
        const eTag = randomUUID()
        const content = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:startup1'), getInvalidTestNotification('id:startup2')],
        }
        getNewETagContentStub.resolves({
            eTag,
            content: JSON.stringify(content),
        })

        await controller.pollForStartUp(ruleEngine)

        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {
                payload: content,
                eTag,
            },
            emergency: {},
            dismissed: [],
        })
        assert.equal(panelNode.getChildren().length, 1)

        getNewETagContentStub.resolves({
            eTag,
            content: undefined,
        })
        await controller.pollForStartUp(ruleEngine)

        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {
                payload: content,
                eTag,
            },
            emergency: {},
            dismissed: [],
        })
        assert.equal(panelNode.getChildren().length, 1)
    })

    it('cleans out dismissed state', async function () {
        const startUpContent = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:startup1')],
        }
        const emergencyContent = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:emergency1')],
        }
        getNewETagContentStub.callsFake(async () => {
            if (fetchUrl.includes('startup')) {
                return {
                    eTag: '1',
                    content: JSON.stringify(startUpContent),
                }
            } else {
                return {
                    eTag: '1',
                    content: JSON.stringify(emergencyContent),
                }
            }
        })

        await controller.pollForStartUp(ruleEngine)
        await controller.pollForEmergencies(ruleEngine)

        await dismissNotification(startUpContent.notifications[0])

        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {
                payload: startUpContent,
                eTag: '1',
            },
            emergency: {
                payload: emergencyContent,
                eTag: '1',
            },
            dismissed: [emergencyContent.notifications[0].id, startUpContent.notifications[0].id],
        })

        const emptyContent = {
            schemaVersion: '1.x',
            notifications: [],
        }
        getNewETagContentStub.callsFake(async () => {
            return {
                eTag: '1',
                content: JSON.stringify(emptyContent),
            }
        })

        await controller.pollForStartUp(ruleEngine)
        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {
                payload: emptyContent,
                eTag: '1',
            },
            emergency: {
                payload: emergencyContent,
                eTag: '1',
            },
            dismissed: [emergencyContent.notifications[0].id],
        })
        assert.equal(panelNode.getChildren().length, 1)

        await controller.pollForEmergencies(ruleEngine)
        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {
                payload: emptyContent,
                eTag: '1',
            },
            emergency: {
                payload: emptyContent,
                eTag: '1',
            },
            dismissed: [],
        })

        assert.equal(panelNode.getChildren().length, 0)
    })

    it('retries if HttpResourceFetcher throws an error and does not rethrow the error', async function () {
        getNewETagContentStub.throws(new Error('network error'))

        const runClock = (async () => {
            await clock.tickAsync(1)
            for (let n = 1; n <= NotificationsController.retryNumber; n++) {
                assert.equal(getNewETagContentStub.callCount, n)
                await clock.tickAsync(NotificationsController.retryIntervalMs)
            }

            // Stop trying
            await clock.tickAsync(NotificationsController.retryNumber)
            assert.equal(getNewETagContentStub.callCount, NotificationsController.retryNumber)
        })()

        await controller.pollForStartUp(ruleEngine).catch((err) => {
            assert.doesNotThrow(() => {
                throw err
            })
        })
        await runClock
    })
})

function getValidTestNotification(id: string) {
    return {
        id,
        displayIf: {
            extensionId: 'aws.toolkit.fake.extension',
        },
        uiRenderInstructions: {
            content: {
                [`en-US`]: {
                    title: 'test',
                    description: 'test',
                },
            },
        },
    }
}

function getInvalidTestNotification(id: string) {
    return {
        id,
        displayIf: {
            extensionId: 'aws.toolkit.fake.extension',
            additionalCriteria: [{ type: 'OS', values: ['MAC'] }],
        },
        uiRenderInstructions: {
            content: {
                [`en-US`]: {
                    title: 'test',
                    description: 'test',
                },
            },
        },
    }
}
