/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { StepEstimator, WIZARD_SKIP } from '../../wizards/wizard'
import { Prompter, PromptResult } from '../prompter'

/** Prompter that return SKIP control signal to parent wizard */
export class SkipPrompter<T> extends Prompter<T> {
    constructor() {
        super()
    }

    protected async promptUser(): Promise<PromptResult<T>> {
        return WIZARD_SKIP
    }

    public get recentItem(): any {
        return undefined
    }

    public set recentItem(response: string | undefined) {}

    public setSteps(current: number, total: number): void {}
    public setStepEstimator(estimator: StepEstimator<T>): void {}
}
