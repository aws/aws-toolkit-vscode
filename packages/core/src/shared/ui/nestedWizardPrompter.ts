/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Wizard, WizardOptions } from '../wizards/wizard'
import { WizardPrompter } from './wizardPrompter'
import { createHash } from 'crypto'

/**
 * An abstract class that extends the base Wizard class plus the ability to
 * use other wizard classes as prompters
 */
export abstract class NestedWizard<T> extends Wizard<T> {
    /**
     * Map to store memoized wizard instances using SHA-256 hashed keys
     */
    private wizardInstances: Map<string, any> = new Map()

    protected constructor(options: WizardOptions<T>) {
        super(options)
    }

    /**
     * Creates or retrieves a memoized wizard prompter instance
     *
     * @param {new (...args: any[]) => T} constructor - The constructor function for creating the wizard instance
     * @param {...any[]} args - Arguments to pass to the constructor
     * @returns {WizardPrompter<T>} A wrapped wizard to be used as prompter in parent wizard class
     *
     * @remarks
     * This method uses memoization to cache wizard instances based on their constructor
     * name and arguments, allowing for restoring wizard state for back button.
     *
     * @example
     * this.createWizardPrompter(
     *       TemplateParametersWizard,
     *       template!.uri,
     *       samSyncUrl,
     *       syncMementoRootKey
     *   ),
     */
    protected createWizardPrompter<T extends Wizard<any>>(
        constructor: new (...args: any[]) => T,
        ...args: ConstructorParameters<new (...args: any[]) => T>
    ): WizardPrompter<T> {
        const memoizeKey = createHash('sha256')
            .update(constructor.name + JSON.stringify(args))
            .digest('hex')

        if (!this.wizardInstances.get(memoizeKey)) {
            this.wizardInstances.set(memoizeKey, new constructor(...args))
        }

        return new WizardPrompter(this.wizardInstances.get(memoizeKey))
    }
}
