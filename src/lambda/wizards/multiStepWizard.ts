/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

export class WizardStep {
    public constructor(
        /**
         * Runs the step and returns the next step.
         * @returns The next step, or undefined if the wizard is complete or cancelled.
         */
        public readonly run: () => Thenable<WizardStep | undefined>
    ) {
    }
}

export abstract class MultiStepWizard<TResult> {
    protected constructor() {
    }

    public async run(): Promise<TResult | undefined> {
        let step: WizardStep | undefined = this.startStep

        while (step) {
            step = await step.run()
        }

        return this.getResult()
    }

    protected abstract get startStep(): WizardStep

    protected abstract getResult(): TResult | undefined
}
