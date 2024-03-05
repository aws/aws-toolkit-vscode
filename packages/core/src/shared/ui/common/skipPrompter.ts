/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { StepEstimator } from '../../wizards/wizard'
import { Prompter, PromptResult } from '../prompter'

/** Pseudo-prompter that immediately returns a value (and thus "skips" a step). */
export class SkipPrompter<T> extends Prompter<T> {
    /**
     * @param val Value immediately returned by the prompter.
     */
    constructor(public readonly val: T) {
        super()
    }

    protected async promptUser(): Promise<PromptResult<T>> {
        const promptPromise = new Promise<PromptResult<T>>(resolve => {
            resolve(this.val)
        })

        return await promptPromise
    }

    public get recentItem(): any {
        return undefined
    }

    public set recentItem(response: string | undefined) {}

    public setSteps(current: number, total: number): void {}
    public setStepEstimator(estimator: StepEstimator<T>): void {}
}
