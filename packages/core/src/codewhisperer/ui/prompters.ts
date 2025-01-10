/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    codeIssueGroupingStrategies,
    CodeIssueGroupingStrategy,
    codeIssueGroupingStrategyLabel,
    CodeIssueGroupingStrategyState,
} from '../models/model'
import { createQuickPick, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { localize } from '../../shared/utilities/vsCodeUtils'

export function createCodeIssueGroupingStrategyPrompter(): QuickPickPrompter<CodeIssueGroupingStrategy> {
    const groupingStrategy = CodeIssueGroupingStrategyState.instance.getState()
    const prompter = createQuickPick(
        codeIssueGroupingStrategies.map((strategy) => ({
            data: strategy,
            label: codeIssueGroupingStrategyLabel[strategy],
        })),
        {
            title: localize('aws.commands.amazonq.groupIssues', 'Group Issues'),
            placeholder: localize('aws.amazonq.codescan.groupIssues.placeholder', 'Select how to group code issues'),
        }
    )
    prompter.quickPick.activeItems = prompter.quickPick.items.filter((item) => item.data === groupingStrategy)
    prompter.quickPick.onDidChangeSelection(async (items) => {
        const [item] = items
        await CodeIssueGroupingStrategyState.instance.setState(item.data)
        prompter.quickPick.hide()
    })
    return prompter
}
