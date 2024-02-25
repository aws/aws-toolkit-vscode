/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnboardingPageInteraction } from '../../../../amazonq/onboardingPage/model'
import { EditorContextCommand, EditorContextCommandType } from '../../../commands/registerCommands'

// TODO: It's a workaround for the demo, we need to remove it after backend will be ready

export class PromptsGenerator {
    private editorContextMenuCommandVerbs: Map<EditorContextCommandType, string> = new Map([
        ['aws.amazonq.explainCode', 'Explain'],
        ['aws.amazonq.refactorCode', 'Refactor'],
        ['aws.amazonq.fixCode', 'Fix'],
        ['aws.amazonq.optimizeCode', 'Optimize'],
        ['aws.amazonq.sendToPrompt', 'Send to prompt'],
    ])

    public generateForContextMenuCommand(command: EditorContextCommand): string {
        return [this.editorContextMenuCommandVerbs.get(command.type), ' the selected codeblock'].join('')
    }

    public generateForOnboardingPageInteraction(interaction: OnboardingPageInteraction): string {
        switch (interaction.type) {
            case 'onboarding-page-cwc-button-clicked':
                return 'What can Q help me with?'
        }
    }
}
