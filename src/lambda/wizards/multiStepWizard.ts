/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

export class WizardStep {
    public constructor(
        public readonly run: () => Thenable<WizardStep>,
        public readonly isTerminal: boolean = false
    ) {
    }
}

export abstract class MultiStepWizard<TResult> {
    protected constructor() {
    }

    public async run(): Promise<TResult | undefined> {
        let step = this.startStep
        while (!step.isTerminal) {
            step = await step.run()
        }

        return this.getResult()
    }

    protected abstract get startStep(): WizardStep

    protected abstract getResult(): TResult | undefined
}
