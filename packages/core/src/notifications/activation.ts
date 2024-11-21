/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { NotificationsController } from './controller'
import { NotificationsNode } from './panelNode'
import { RuleEngine, getRuleContext } from './rules'
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
export async function activate(
    context: vscode.ExtensionContext,
    initialState: AuthState,
    authStateFn: () => Promise<AuthState>
) {
    try {
        const panelNode = NotificationsNode.instance
        panelNode.registerView(context)

        const controller = new NotificationsController(panelNode)
        const engine = new RuleEngine(await getRuleContext(context, initialState))

        await controller.pollForStartUp(engine)
        await controller.pollForEmergencies(engine)

        globals.clock.setInterval(async () => {
            const ruleContext = await getRuleContext(context, await authStateFn())
            await controller.pollForEmergencies(new RuleEngine(ruleContext))
        }, emergencyPollTime)

        logger.debug('Activated in-IDE notifications polling module')
    } catch (err) {
        logger.error('Failed to activate in-IDE notifications module.')
    }
}
