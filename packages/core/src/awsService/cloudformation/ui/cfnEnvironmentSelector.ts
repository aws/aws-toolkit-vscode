/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { commands, window } from 'vscode'
import { CfnEnvironmentConfig, CfnEnvironmentLookup } from '../cfn-init/cfnProjectTypes'
import { commandKey } from '../utils'

export class CfnEnvironmentSelector {
    public async selectEnvironment(environmentLookup: CfnEnvironmentLookup): Promise<string | undefined> {
        if (Object.keys(environmentLookup).length === 0) {
            const choice = await window.showWarningMessage('No environments found in CFN Project', 'Add environment')

            if (choice === 'Add environment') {
                void commands.executeCommand(commandKey('init.addEnvironment'))
            }

            return
        }

        const items = [
            { label: 'None', description: 'No environment selected' },
            ...Object.values(environmentLookup).map((env: CfnEnvironmentConfig) => ({
                label: env.name,
                description: `AWS Profile: ${env.profile}`,
            })),
        ]

        const selected = await window.showQuickPick(items, {
            placeHolder: 'Select an environment',
        })

        return selected?.label === 'None' ? undefined : selected?.label
    }
}
