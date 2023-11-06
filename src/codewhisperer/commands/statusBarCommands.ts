/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createExitButton } from '../../shared/ui/buttons'
import { createQuickPick } from '../../shared/ui/pickerPrompter'
import { Commands } from '../../shared/vscode/commands2'
import { getCodewhispererNode } from '../explorer/codewhispererNode'

export const showCodeWhispererQuickPickCommand = 'aws.codewhisperer.quickpick'
export const showCodeWhispererQuickPick = Commands.declare({ id: showCodeWhispererQuickPickCommand }, () => () => {
    return createQuickPick(getCodewhispererNode().getChildren('item'), {
        title: 'CodeWhisperer',
        buttons: [createExitButton()],
        ignoreFocusOut: false,
    }).prompt()
})
