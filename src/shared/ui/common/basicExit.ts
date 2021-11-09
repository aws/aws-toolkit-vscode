/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { localize } from '../../utilities/vsCodeUtils'
import { createQuickPick } from '../pickerPrompter'
import { Prompter, PrompterConfiguration, PromptResult } from '../prompter'

class ExitPrompter extends Prompter<boolean> {
    public get recentItem(): any {
        return undefined
    }

    public set recentItem(response: any) {}

    constructor() {
        super()
    }
    protected async promptUser(config: PrompterConfiguration): Promise<PromptResult<boolean>> {
        // Exit was initiated from the first step, so the prompt would be step 2
        if (config.steps?.current === 2) {
            return true
        }

        const prompter = createQuickPick(
            [
                { label: localize('AWS.generic.response.no', 'No'), data: false },
                { label: localize('AWS.generic.response.yes', 'Yes'), data: true },
            ],
            {
                title: localize('AWS.wizards.exit.title', 'Exit wizard?'),
            }
        )

        return await prompter.promptControl()
    }
}

declare interface ExitPrompterConstructor {
    (): ExitPrompter
    new (): ExitPrompter
}

export const BasicExitPrompter = function () {
    return new ExitPrompter()
} as ExitPrompterConstructor
