/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { localize } from '../../utilities/vsCodeUtils'
import { createQuickPick, QuickPickPrompter } from '../pickerPrompter'
import { Prompter, PrompterConfiguration, PromptResult } from '../prompter'

class ExitPrompter extends Prompter<boolean> {
    private prompter: QuickPickPrompter<boolean>

    public get recentItem(): any {
        return undefined
    }

    public set recentItem(response: any) {}

    constructor() {
        super()

        this.prompter = createQuickPick(
            [
                { label: localize('AWS.generic.response.no', 'No'), data: false },
                { label: localize('AWS.generic.response.yes', 'Yes'), data: true },
            ],
            {
                title: localize('AWS.wizards.exit.title', 'Exit wizard?'),
            }
        )
    }

    public override dispose() {
        this.prompter.dispose()
        super.dispose()
    }

    protected async promptUser(config: PrompterConfiguration): Promise<PromptResult<boolean>> {
        // Immediately exit if on the first step
        if (config.steps?.current === 2) {
            return true
        }

        return await this.prompter.promptControl()
    }
}

declare interface ExitPrompterConstructor {
    (): ExitPrompter
    new (): ExitPrompter
}

export const BasicExitPrompter = function () {
    return new ExitPrompter()
} as ExitPrompterConstructor
