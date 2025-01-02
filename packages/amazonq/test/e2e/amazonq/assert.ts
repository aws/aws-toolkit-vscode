/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Messenger } from './framework/messenger'

export function assertQuickActions(tab: Messenger, commands: string[]) {
    const commandGroup = tab
        .getCommands()
        .map((groups) => groups.commands)
        .flat()
    if (!commandGroup) {
        assert.fail(`Could not find commands for ${tab.tabID}`)
    }

    const commandNames = commandGroup.map((cmd) => cmd.command)

    const missingCommands = []
    for (const command of commands) {
        if (!commandNames.includes(command)) {
            missingCommands.push(command)
        }
    }

    if (missingCommands.length > 0) {
        assert.fail(`Could not find commands: ${missingCommands.join(', ')} for ${tab.tabID}`)
    }
}
