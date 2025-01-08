/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0 fort
 */

import { RemoteFetcher } from '../../notifications/controller'
import { NotificationsController } from '../../notifications/controller'
import { NotificationsNode } from '../../notifications/panelNode'
import { NotificationsState, RuleContext } from '../../notifications/types'
import globals from '../../shared/extensionGlobals'
import assert from 'assert'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import sinon from 'sinon'
import { globalKey } from '../../shared/globalState'

describe('Notifications Integration Test', function () {
    const storageKey = 'aws.notifications.test' as globalKey
    let fetcher: RemoteFetcher
    let panelNode: NotificationsNode

    function getController(activeExtensions: string[], connected: boolean) {
        const authState = connected ? 'connected' : 'notConnected'

        const ruleContext: RuleContext = {
            ideVersion: '1.83.0',
            extensionVersion: '1.20.0',
            os: 'LINUX',
            computeEnv: 'local',
            authTypes: ['builderId'],
            authRegions: ['us-east-2'],
            authStates: [authState],
            authScopes: ['codewhisperer:completions', 'codewhisperer:analysis'],
            activeExtensions: activeExtensions,
        }

        return new NotificationsController(panelNode, async () => ruleContext, fetcher, storageKey)
    }

    beforeEach(async function () {
        panelNode = NotificationsNode.instance
        // fetch from test host file folder
        fetcher = new RemoteFetcher(
            'https://idetoolkits-hostedfiles.amazonaws.com/Notifications/integ/VSCode/startup/1.x.json',
            'https://idetoolkits-hostedfiles.amazonaws.com/Notifications/integ/VSCode/emergency/1.x.json'
        )
    })

    // Clear all global states after each test
    afterEach(async function () {
        await globals.globalState.update(storageKey, undefined)
    })

    it('Receive notifications polling from endpoint', async function () {
        const controller = getController([VSCODE_EXTENSION_ID.amazonq], true)

        await controller.pollForStartUp()
        await controller.pollForEmergencies()

        // Verify that notifications are stored in the state
        const state = globals.globalState.get<NotificationsState>(controller.storageKey)
        assert.ok(state, 'State should be defined')
        assert.ok(state.startUp.payload?.notifications, 'StartUp received')
        assert.strictEqual(
            state?.startUp.payload?.notifications.length,
            2,
            'There should be 2 startup notifications stored'
        )
        assert.ok(state?.emergency.payload?.notifications, 'Emergency received')
        assert.strictEqual(
            state?.emergency.payload?.notifications.length,
            2,
            'There should be 2 emergency notifications stored'
        )
    })

    it('Display notification according to criterias', async function () {
        const controller = getController([VSCODE_EXTENSION_ID.amazonq], false)
        await controller.pollForEmergencies()

        // Verify that only the not authed notification is displayed
        const displayedNotifications = panelNode.emergencyNotifications
        assert.strictEqual(displayedNotifications.length, 1, 'Only one notification displayed"')
        assert.strictEqual(
            displayedNotifications[0].id,
            'emergency1',
            'The displayed notification have the ID "emergency1"'
        )
    })

    it('Should trigger onReceive only for newly received notifications', async function () {
        const controller = getController([VSCODE_EXTENSION_ID.amazonq], true)
        const onReceiveSpy = sinon.spy(panelNode, 'onReceiveNotifications')

        // Simulate alreadying receving a notification
        const existingNotificationID = 'startup1'
        const state = globals.globalState.get<NotificationsState>(controller.storageKey)
        if (state) {
            state.newlyReceived.push(existingNotificationID)
            await globals.globalState.update(controller.storageKey, state)
        }

        // Poll for new notification
        await controller.pollForStartUp()

        /**
         * Since we simulated startup1 is already received
         * onReceived should be called exactly once for startup2
         */
        assert.ok(onReceiveSpy.calledOnce, 'only one new notification received')

        onReceiveSpy.restore()
    })
})
