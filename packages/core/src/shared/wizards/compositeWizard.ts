/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Wizard, WizardOptions } from './wizard'
import { Prompter } from '../ui/prompter'
import { WizardPrompter } from '../ui/wizardPrompter'
import { createHash } from 'crypto'

/**
 * An abstract class that extends the base Wizard class plus the ability to
 * use other wizard classes as prompters
 */
export abstract class CompositeWizard<T> extends Wizard<T> {
    /**
     * Map to store memoized wizard instances using SHA-256 hashed keys
     */
    private wizardInstances: Map<string, any> = new Map()

    public constructor(options?: WizardOptions<T>) {
        super(options)
    }

    /**
     * Creates a prompter for a wizard instance with memoization.
     *
     * @template TWizard - The type of wizard, must extend Wizard<TState>
     * @template TState - The type of state managed by the wizard
     *
     * @param wizardClass - The wizard class constructor
     * @param args - Constructor arguments for the wizard instance
     *
     * @returns A wizard prompter to be used as prompter
     *
     * @example
     * // Create a prompter for SyncWizard
     * const prompter = this.createWizardPrompter<SyncWizard, SyncParams>(
     *     SyncWizard,
     *     template.uri,
     *     syncUrl
     * )
     *
     * @remarks
     * - Instances are memoized using a SHA-256 hash of the wizard class name and arguments
     * - The same wizard instance is reused for identical constructor parameters for restoring wizard prompter
     *   states during back button click event
     */
    protected createWizardPrompter<TWizard extends Wizard<TState>, TState>(
        wizardClass: new (...args: any[]) => TWizard,
        ...args: ConstructorParameters<new (...args: any[]) => TWizard>
    ): Prompter<TState> {
        const memoizeKey = createHash('sha256')
            .update(wizardClass.name + JSON.stringify(args))
            .digest('hex')

        if (!this.wizardInstances.get(memoizeKey)) {
            this.wizardInstances.set(memoizeKey, new wizardClass(...args))
        }

        return new WizardPrompter(this.wizardInstances.get(memoizeKey)) as Prompter<TState>
    }
}
