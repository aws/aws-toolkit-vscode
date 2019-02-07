/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

export interface WizardStep {
    (): Thenable<WizardStep | undefined>
}

export abstract class MultiStepWizard<TResult> {
    protected constructor() {
    }

    public async run(): Promise<TResult | undefined> {
        let step: WizardStep | undefined = this.startStep

        while (step) {
            step = await step()
        }

        return this.getResult()
    }

    protected abstract get startStep(): WizardStep

    protected abstract getResult(): TResult | undefined
}
