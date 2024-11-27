/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as FakeTimers from '@sinonjs/fake-timers'
import assert from 'assert'
import sinon from 'sinon'
import globals from '../../shared/extensionGlobals'
import { randomUUID } from '../../shared/crypto'
import { getContext } from '../../shared/vscode/setContext'
import { assertTelemetry, installFakeClock } from '../testUtil'
import {
    NotificationFetcher,
    NotificationsController,
    RemoteFetcher,
    ResourceResponse,
} from '../../notifications/controller'
import {
    NotificationData,
    NotificationType,
    RuleContext,
    ToolkitNotification,
    getNotificationTelemetryId,
} from '../../notifications/types'
import { HttpResourceFetcher } from '../../shared/resourcefetcher/httpResourceFetcher'
import { NotificationsNode } from '../../notifications/panelNode'
import { RuleEngine } from '../../notifications/rules'

// one test node to use across different tests
export const panelNode: NotificationsNode = NotificationsNode.instance

describe('Notifications Controller', function () {
    const ruleContex: RuleContext = {
        ideVersion: '1.83.0',
        extensionVersion: '1.20.0',
        os: 'LINUX',
        computeEnv: 'local',
        authTypes: ['builderId'],
        authRegions: ['us-east-1'],
        authStates: ['connected'],
        authScopes: ['codewhisperer:completions', 'codewhisperer:analysis'],
        activeExtensions: ['ext1', 'ext2'],
    }

    let controller: NotificationsController
    let fetcher: TestFetcher

    let ruleEngineSpy: sinon.SinonSpy
    let focusPanelSpy: sinon.SinonSpy

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

    class TestFetcher implements NotificationFetcher {
        private startUpContent: ResourceResponse = {
            eTag: 'unset',
            content: undefined,
        }
        private emergencyContent: ResourceResponse = {
            eTag: 'unset',
            content: undefined,
        }

        setStartUpContent(content: ResourceResponse) {
            this.startUpContent = content
        }

        setEmergencyContent(content: ResourceResponse) {
            this.emergencyContent = content
        }

        async fetch(category: NotificationType): Promise<ResourceResponse> {
            return category === 'startUp' ? this.startUpContent : this.emergencyContent
        }
    }

    beforeEach(async function () {
        await panelNode.setNotifications([], [])
        fetcher = new TestFetcher()
        controller = new NotificationsController(
            panelNode,
            async () => ruleContex,
            fetcher,
            '_aws.test.notification' as any
        )

        ruleEngineSpy = sinon.spy(RuleEngine.prototype, 'shouldDisplayNotification')
        focusPanelSpy = sinon.spy(panelNode, 'focusPanel')

        await globals.globalState.update(controller.storageKey, {
            startUp: {} as NotificationData,
            emergency: {} as NotificationData,
            dismissed: [],
        })
    })

    afterEach(function () {
        ruleEngineSpy.restore()
        focusPanelSpy.restore()
    })

    it('can fetch and store startup notifications', async function () {
        const eTag = randomUUID()
        const content = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:startup1'), getInvalidTestNotification('id:startup2')],
        }
        fetcher.setStartUpContent({
            eTag,
            content: JSON.stringify(content),
        })

        await controller.pollForStartUp()

        assert.equal(ruleEngineSpy.callCount, 2)
        assert.deepStrictEqual(ruleEngineSpy.args, [[content.notifications[0]], [content.notifications[1]]])
        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {
                payload: content,
                eTag,
            },
            emergency: {},
            dismissed: [],
            newlyReceived: ['id:startup2'],
        })
        assert.equal(panelNode.startUpNotifications.length, 1)
        assert.equal(panelNode.emergencyNotifications.length, 0)
        assert.deepStrictEqual(panelNode.startUpNotifications, [content.notifications[0]])
        assert.equal(panelNode.getChildren().length, 1)
        assert.equal(focusPanelSpy.callCount, 0)
        assert.equal(getContext('aws.toolkit.notifications.show'), true)
    })

    it('can fetch and store emergency notifications', async function () {
        const eTag = randomUUID()
        const content = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:emergency1'), getInvalidTestNotification('id:emergency2')],
        }
        fetcher.setEmergencyContent({
            eTag,
            content: JSON.stringify(content),
        })

        await controller.pollForEmergencies()

        assert.equal(ruleEngineSpy.callCount, 2)
        assert.deepStrictEqual(ruleEngineSpy.args, [[content.notifications[0]], [content.notifications[1]]])
        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {},
            emergency: {
                payload: content,
                eTag,
            },
            dismissed: [],
            newlyReceived: ['id:emergency2'],
        })
        assert.equal(panelNode.startUpNotifications.length, 0)
        assert.equal(panelNode.emergencyNotifications.length, 1)
        assert.deepStrictEqual(panelNode.emergencyNotifications, [content.notifications[0]])
        assert.equal(panelNode.getChildren().length, 1)
        assert.equal(focusPanelSpy.callCount, 1)
        assert.equal(getContext('aws.toolkit.notifications.show'), true)
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
        fetcher.setStartUpContent({
            eTag: eTag1,
            content: JSON.stringify(startUpContent),
        })
        fetcher.setEmergencyContent({
            eTag: eTag2,
            content: JSON.stringify(emergencyContent),
        })

        await controller.pollForStartUp()
        await controller.pollForEmergencies()

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
            dismissed: [],
            newlyReceived: ['id:startup2', 'id:emergency2'],
        })
        assert.equal(panelNode.startUpNotifications.length, 1)
        assert.equal(panelNode.emergencyNotifications.length, 1)
        assert.deepStrictEqual(panelNode.startUpNotifications, [startUpContent.notifications[0]])
        assert.deepStrictEqual(panelNode.emergencyNotifications, [emergencyContent.notifications[0]])
        assert.equal(panelNode.getChildren().length, 2)
        assert.equal(focusPanelSpy.callCount, 1)
        assert.equal(getContext('aws.toolkit.notifications.show'), true)
    })

    it('dismisses a startup notification', async function () {
        const eTag = randomUUID()
        const content = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:startup1'), getValidTestNotification('id:startup2')],
        }
        fetcher.setStartUpContent({
            eTag,
            content: JSON.stringify(content),
        })

        await controller.pollForStartUp()

        assert.equal(panelNode.getChildren().length, 2)
        assert.equal(panelNode.startUpNotifications.length, 2)
        assert.equal(getContext('aws.toolkit.notifications.show'), true)

        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {
                payload: content,
                eTag,
            },
            emergency: {},
            dismissed: [],
            newlyReceived: [],
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
            newlyReceived: [],
        })

        assert.equal(panelNode.getChildren().length, 1)
        assert.equal(panelNode.startUpNotifications.length, 1)
    })

    it('does not redisplay dismissed notifications', async function () {
        const content = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:startup1')],
        }
        fetcher.setStartUpContent({
            eTag: '1',
            content: JSON.stringify(content),
        })

        await controller.pollForStartUp()
        assert.equal(panelNode.getChildren().length, 1)
        assert.equal(getContext('aws.toolkit.notifications.show'), true)

        await dismissNotification(content.notifications[0])
        assert.equal(panelNode.getChildren().length, 0)
        assert.equal(getContext('aws.toolkit.notifications.show'), false)

        content.notifications.push(getValidTestNotification('id:startup2'))
        fetcher.setStartUpContent({
            eTag: '1',
            content: JSON.stringify(content),
        })

        await controller.pollForStartUp()

        const actualState = await globals.globalState.get(controller.storageKey)
        assert.deepStrictEqual(actualState, {
            startUp: {
                payload: content,
                eTag: '1',
            },
            emergency: {},
            dismissed: [content.notifications[0].id],
            newlyReceived: [],
        })

        assert.equal(panelNode.getChildren().length, 1)
        assert.equal(getContext('aws.toolkit.notifications.show'), true)
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
        fetcher.setStartUpContent({
            eTag: '1',
            content: JSON.stringify(startUpContent),
        })
        fetcher.setEmergencyContent({
            eTag: '1',
            content: JSON.stringify(emergencyContent),
        })

        await controller.pollForEmergencies()
        await controller.pollForEmergencies()
        await controller.pollForStartUp()

        assert.equal(focusPanelSpy.callCount, 1)
        assert.equal(panelNode.getChildren().length, 2)
    })

    it('does not update state if eTag is not changed', async function () {
        const eTag = randomUUID()
        const content = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:startup1'), getInvalidTestNotification('id:startup2')],
        }
        fetcher.setStartUpContent({
            eTag,
            content: JSON.stringify(content),
        })

        await controller.pollForStartUp()

        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {
                payload: content,
                eTag,
            },
            emergency: {},
            dismissed: [],
            newlyReceived: ['id:startup2'],
        })
        assert.equal(panelNode.getChildren().length, 1)

        fetcher.setStartUpContent({
            eTag,
            content: undefined,
        })
        await controller.pollForStartUp()

        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {
                payload: content,
                eTag,
            },
            emergency: {},
            dismissed: [],
            newlyReceived: ['id:startup2'],
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
        fetcher.setStartUpContent({
            eTag: '1',
            content: JSON.stringify(startUpContent),
        })
        fetcher.setEmergencyContent({
            eTag: '1',
            content: JSON.stringify(emergencyContent),
        })

        await controller.pollForStartUp()
        await controller.pollForEmergencies()

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
            dismissed: [startUpContent.notifications[0].id],
            newlyReceived: [],
        })

        const emptyContent = {
            schemaVersion: '1.x',
            notifications: [],
        }
        fetcher.setStartUpContent({
            eTag: '1',
            content: JSON.stringify(emptyContent),
        })

        await controller.pollForStartUp()
        assert.deepStrictEqual(await globals.globalState.get(controller.storageKey), {
            startUp: {
                payload: emptyContent,
                eTag: '1',
            },
            emergency: {
                payload: emergencyContent,
                eTag: '1',
            },
            dismissed: [],
            newlyReceived: [],
        })
        assert.equal(panelNode.getChildren().length, 1)
        assert.equal(getContext('aws.toolkit.notifications.show'), true)

        fetcher.setEmergencyContent({
            eTag: '1',
            content: JSON.stringify(emptyContent),
        })

        await controller.pollForEmergencies()
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
            newlyReceived: [],
        })

        assert.equal(panelNode.getChildren().length, 0)
        assert.equal(getContext('aws.toolkit.notifications.show'), false)
    })

    it('does not rethrow errors when fetching', async function () {
        let wasCalled = false
        const fetcher = new (class _ extends TestFetcher {
            override async fetch(): Promise<ResourceResponse> {
                wasCalled = true
                throw new Error('test error')
            }
        })()
        assert.doesNotThrow(() =>
            new NotificationsController(panelNode, async () => ruleContex, fetcher).pollForStartUp()
        )
        assert.ok(wasCalled)
    })

    it('calls onReceiveNotifications when a new valid notification is added', async function () {
        const eTag = randomUUID()
        const content = {
            schemaVersion: '1.x',
            notifications: [getValidTestNotification('id:newValidNotification')],
        }
        fetcher.setStartUpContent({
            eTag,
            content: JSON.stringify(content),
        })

        const onReceiveSpy = sinon.spy(panelNode, 'onReceiveNotifications')

        await controller.pollForStartUp()

        assert.equal(onReceiveSpy.callCount, 1)
        assert.deepStrictEqual(onReceiveSpy.args[0][0], [content.notifications[0]])
        assertTelemetry('toolkit_showNotification', { id: getNotificationTelemetryId(content.notifications[0]) })

        onReceiveSpy.restore()
    })
})

describe('RemoteFetcher', function () {
    let clock: FakeTimers.InstalledClock

    before(function () {
        clock = installFakeClock()
    })

    afterEach(function () {
        clock.reset()
    })

    after(function () {
        clock.uninstall()
    })

    it('retries and throws error', async function () {
        const httpStub = sinon.stub(HttpResourceFetcher.prototype, 'getNewETagContent')
        httpStub.throws(new Error('network error'))

        const runClock = (async () => {
            await clock.tickAsync(1)
            for (let n = 1; n <= RemoteFetcher.retryNumber; n++) {
                assert.equal(httpStub.callCount, n)
                await clock.tickAsync(RemoteFetcher.retryIntervalMs)
            }

            // Stop trying
            await clock.tickAsync(RemoteFetcher.retryNumber)
            assert.equal(httpStub.callCount, RemoteFetcher.retryNumber)
        })()

        const fetcher = new RemoteFetcher()
        await fetcher
            .fetch('startUp', 'any')
            .then(() => assert.ok(false, 'Did not throw exception.'))
            .catch(() => assert.ok(true))
        await runClock

        httpStub.restore()
    })
})

function getValidTestNotification(id: string): ToolkitNotification {
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
            onReceive: 'toast',
            onClick: {
                type: 'openUrl',
                url: 'https://aws.amazon.com/visualstudiocode/',
            },
        },
    }
}

function getInvalidTestNotification(id: string): ToolkitNotification {
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
            onReceive: 'toast',
            onClick: { type: 'modal' },
        },
    }
}
