/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Wizard, WizardOptions } from '../wizards/wizard'
import { WizardPrompter } from './wizardPrompter'
import { createHash } from 'crypto'

export abstract class NestedWizard<T> extends Wizard<T> {
    // Map to store wizard instances
    private wizardInstances: Map<string, any> = new Map()

    protected constructor(options: WizardOptions<T>) {
        super(options)
    }

    protected createWizardPrompter<T>(constructor: new (...args: any[]) => T, ...args: any[]): WizardPrompter<T> {
        const memoizeKey = createHash('sha256')
            .update(constructor.name + JSON.stringify(args))
            .digest('hex')
        if (!this.wizardInstances.get(memoizeKey) as T) {
            this.wizardInstances.set(memoizeKey, new constructor(...args))
        }
        return new WizardPrompter(this.wizardInstances.get(memoizeKey))
    }
}
