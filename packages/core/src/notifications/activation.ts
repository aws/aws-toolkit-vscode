/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DevSettings } from '../shared/settings'
import { NotificationsController, ControllerOptions, RemoteFetcher } from './controller'
import { NotificationsNode } from './panelNode'
import { RuleEngine, getRuleContext } from './rules'
import globals from '../shared/extensionGlobals'
import { AuthState } from './types'
import { getLogger } from '../shared/logger/logger'
import { oneMinute } from '../shared/datetime'
import { globalKey } from '../shared/globalState'

/** Time in MS to poll for emergency notifications */
const emergencyPollTime = oneMinute * 10

/** Key in global state to store notification data */
const storageKey: globalKey = 'aws.notifications'

let interval: NodeJS.Timer

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
    authStateFn: () => Promise<AuthState>,
    options?: Partial<Omit<ControllerOptions, 'node'>>
) {
    // TODO: Currently gated behind feature-flag.
    if (!DevSettings.instance.get('notifications', false)) {
        return
    }

    const panelNode = NotificationsNode.instance
    panelNode.registerView(context)

    const controller = new NotificationsController({
        node: panelNode,
        fetcher: options?.fetcher ?? new RemoteFetcher(),
        storageKey: options?.storageKey ?? storageKey,
    })
    const engine = new RuleEngine(await getRuleContext(context, initialState))

    await controller.pollForStartUp(engine)
    await controller.pollForEmergencies(engine)

    if (interval !== undefined) {
        globals.clock.clearInterval(interval)
    }

    interval = globals.clock.setInterval(async () => {
        const ruleContext = await getRuleContext(context, await authStateFn())
        await controller.pollForEmergencies(new RuleEngine(ruleContext))
    }, emergencyPollTime)

    getLogger('notifications').debug('Activated in-IDE notifications polling module')
}

export function deactivate() {
    globals.clock.clearInterval(interval)
    getLogger('notifications').debug('Deactivated in-IDE notifications polling module')
}
