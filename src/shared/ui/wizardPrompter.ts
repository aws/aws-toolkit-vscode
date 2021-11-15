/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WizardControl } from '../wizards/util'
import { StepCache, StepEstimator, Wizard } from '../wizards/wizard'
import { Prompter, PrompterConfiguration, PromptResult } from './prompter'

type WizardCache = Record<string, StepCache>

/**
 * Wraps {@link Wizard} object into its own {@link Prompter}, allowing wizards to use other
 * wizards in their flows.
 */
export class WizardPrompter<T> extends Prompter<T> {
    public get recentItem(): WizardCache {
        return this.wizard.cache
    }
    public set recentItem(response: WizardCache) {
        this.wizard.cache = response
    }

    private stepOffset: number = 0
    private response: T | undefined

    public get totalSteps(): number {
        return this.wizard.totalSteps - this.stepOffset
    }

    constructor(private readonly wizard: Wizard<T>) {
        super()
    }

    private applySteps(current: number, total: number): void {
        if (this.wizard.currentStep === 1) {
            this.wizard.stepOffset = [current - 1, total - 1]
        }

        this.stepOffset = total - 1
    }

    private applyStepEstimator(estimator: StepEstimator<T>): void {
        const estimates = new Map<string, number>()

        this.wizard.parentEstimator = state => {
            const key = JSON.stringify(state)
            const transformed = this.applyTransforms(state)
            const estimate = estimator(transformed)

            estimates.set(key, estimate)

            return estimate
        }
    }

    protected async promptUser(config: PrompterConfiguration<T>): Promise<PromptResult<T>> {
        if (config.steps) {
            this.applySteps(config.steps.current, config.steps.total)
        }

        if (config.stepEstimator) {
            this.applyStepEstimator(config.stepEstimator)
        }

        this.response = await this.wizard.run()
        return this.response ?? WizardControl.Back
    }
}
