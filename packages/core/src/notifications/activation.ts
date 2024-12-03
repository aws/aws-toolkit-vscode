/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DevSettings } from '../shared/settings'
import { DevFetcher, NotificationsController, RemoteFetcher } from './controller'
import { NotificationsNode } from './panelNode'
import { getRuleContext } from './rules'
import globals from '../shared/extensionGlobals'
import { AuthState } from './types'
import { getLogger } from '../shared/logger/logger'
import { oneMinute } from '../shared/datetime'

const logger = getLogger('notifications')

/** Time in MS to poll for emergency notifications */
const emergencyPollTime = oneMinute * 10

/**
 * Activate the in-IDE notifications module and begin receiving notifications.
 *
 * @param context extension context
 * @param initialState initial auth state
 * @param authStateFn fn to get current auth state
 */
export async function activate(context: vscode.ExtensionContext, authStateFn: () => Promise<AuthState>) {
    try {
        const panelNode = NotificationsNode.instance
        panelNode.registerView(context)

        const controller = new NotificationsController(
            panelNode,
            async () => await getRuleContext(context, await authStateFn()),
            DevSettings.instance.isDevMode() ? new DevFetcher() : new RemoteFetcher()
        )

        await controller.pollForStartUp()
        await controller.pollForEmergencies()

        globals.clock.setInterval(
            async () => {
                await controller.pollForEmergencies()
            },
            DevSettings.instance.get('notificationsPollInterval', emergencyPollTime)
        )

        logger.debug('Activated in-IDE notifications polling module')
    } catch (err) {
        logger.error('Failed to activate in-IDE notifications module.')
    }
}
