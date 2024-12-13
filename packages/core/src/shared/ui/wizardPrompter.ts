/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import _ from 'lodash'
import { StepEstimator, Wizard, WIZARD_BACK, WIZARD_SKIP } from '../wizards/wizard'
import { Prompter, PromptResult } from './prompter'

/**
 * Wraps {@link Wizard} object into its own {@link Prompter}, allowing wizards to use other wizards in their flows.
 * This is meant to be used exclusively in createWizardPrompter() method of {@link CompositeWizard} class.
 *
 * @remarks
 *  - The WizardPrompter class should never be instantiated with directly.
 *  - Use createWizardPrompter() method of {@link CompositeWizard} when creating a nested wizard prompter for proper state management.
 *  - See examples:
 *     - {@link SingleNestedWizard}
 *     - {@link DoubleNestedWizard}
 */
export class WizardPrompter<T> extends Prompter<T> {
    public get recentItem(): any {
        return undefined
    }
    public set recentItem(response: any) {}
    private stepOffset: number = 0
    private response: T | undefined

    constructor(private readonly wizard: Wizard<T>) {
        super()
    }

    public setSteps(current: number, total: number): void {
        if (this.wizard.currentStep === 1) {
            this.wizard.stepOffset = [current - 1, total - 1]
        }

        this.stepOffset = total - 1
    }

    public override get totalSteps(): number {
        return this.wizard.totalSteps - this.stepOffset
    }

    public setStepEstimator(estimator: StepEstimator<T>): void {
        const estimates = new Map<string, number>()

        this.wizard.parentEstimator = (state) => {
            const key = JSON.stringify(state)
            const transformed = this.applyTransforms(state)
            const estimate = estimator(transformed)

            estimates.set(key, estimate)

            return estimate
        }
    }

    protected async promptUser(): Promise<PromptResult<T>> {
        this.response = await this.wizard.run()

        if (this.response === undefined) {
            return WIZARD_BACK as PromptResult<T>
        } else if (_.isEmpty(this.response)) {
            return WIZARD_SKIP as PromptResult<T>
        }

        return {
            ...this.response,
        } as PromptResult<T>
    }
}
