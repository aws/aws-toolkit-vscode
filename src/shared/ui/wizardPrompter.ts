/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Wizard } from "../wizards/wizard";
import { Prompter, PromptResult } from "./prompter";

export class WizardPrompter<T> extends Prompter<T> {
    private stepOffset: number = 0
    private response: T | undefined 

    constructor(private readonly wizard: Wizard<T>) {
        super()
    }

    public setSteps(current: number, total: number): void {
        if (this.wizard.currentStep === 1) {
            this.wizard.currentStep = current - 1
            this.wizard.totalSteps = total - 1
        }

        this.stepOffset = total - 1
    }

    public get totalSteps(): number { return this.wizard.totalSteps - this.stepOffset }

    protected async promptUser(): Promise<PromptResult<T>> {
        this.response = await this.wizard.run()
        return this.response
    }

    public setLastResponse(lastResponse?: any): void {}
    public getLastResponse() {}   
}