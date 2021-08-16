/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { localize } from '../../utilities/vsCodeUtils'
import { StepEstimator } from '../../wizards/wizard'
import { createQuickPick } from '../pickerPrompter'
import { Prompter, CachedPrompter, PromptResult } from '../prompter'

class BasicExitPrompter extends Prompter<boolean> {
    private _isStart = true

    public get lastResponse(): any {
        return undefined
    }

    public set lastResponse(response: any) {}
    protected async promptUser(): Promise<PromptResult<boolean>> {
        if (this._isStart) {
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

        return await prompter.prompt()
    }
    public setSteps(current: number, total: number): void {
        // Exit was initiated from the first step, so the prompt would be step 2
        this._isStart = current === 2
    }
    public setStepEstimator(estimator: StepEstimator<boolean>): void {}
}

export class BasicExitPrompterProvider extends CachedPrompter<boolean, any> {
    protected load(...args: any) {
        return undefined
    }
    protected createPrompter(loader: any, state: any): Prompter<boolean> {
        return new BasicExitPrompter()
    }
}
