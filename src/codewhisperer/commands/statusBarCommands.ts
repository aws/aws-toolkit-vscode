/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createExitButton } from '../../shared/ui/buttons'
import { createQuickPick } from '../../shared/ui/pickerPrompter'
import { Commands } from '../../shared/vscode/commands2'
import { getCodewhispererNode } from '../explorer/codewhispererNode'

export const listCodeWhispererCommandsId = 'aws.codewhisperer.listCommands'
export const listCodeWhispererCommands = Commands.declare({ id: listCodeWhispererCommandsId }, () => () => {
    return createQuickPick(getCodewhispererNode().getChildren('item'), {
        title: 'CodeWhisperer',
        buttons: [createExitButton()],
        ignoreFocusOut: false,
    }).prompt()
})
