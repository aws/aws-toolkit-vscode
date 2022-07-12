/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logging } from '../logger/commands'
import { getLogger } from '../logger/logger'
import { createBackButton } from '../ui/buttons'
import { createInputBox } from '../ui/inputPrompter'
import { createQuickPick } from '../ui/pickerPrompter'
import { Commands } from '../vscode/commands2'
import { ControlSignal } from './stateController'
import { Wizard } from './wizard'

interface Prompt {
    readonly title: string
    readonly items: string[]
}

interface Flow {
    readonly schema: Record<string, Prompt>
}

// The current `Wizard` is designed around static definitions rather than dynamic ones
// It can work with pure data, but we'll need to tweak things as well as include more information in the data
function buildWizard(flow: Flow): Wizard<Record<string, any>> {
    return new (class extends Wizard<any> {
        private readonly assigned: Record<string, boolean> = {}

        public constructor() {
            super()

            for (const [key, value] of Object.entries(flow.schema)) {
                const items = value.items.map(i => ({ label: i, data: i }))
                this.form[key].bindPrompter(() =>
                    createQuickPick(items, {
                        title: value.title,
                        buttons: [createBackButton()],
                    })
                )
                this.assigned[key] = true
            }
        }

        protected override async afterPrompt(
            state: Record<string, any>,
            prop: string,
            signal?: ControlSignal
        ): Promise<void> {
            // More steps can be added here in a similar pattern as the constructor
            // The wizard will 'stall' until this function returns
            // Step bindings are not cleaned-up if the user goes backwards; changes to the wizard code are needed for that
            // Still, you can 'fake' it easily by dynamically constructing predicates passed through `showWhen`

            if (state[prop] === 'item4' && !this.assigned['step4']) {
                this.form['step4'].bindPrompter(() =>
                    createInputBox({
                        title: 'Secret Step 4',
                        buttons: [createBackButton()],
                    })
                )
                this.assigned['step4'] = true
            }

            this.assignSteps()
        }
    })()
}

const example: Flow = {
    schema: {
        step1: {
            title: 'Step 1',
            items: ['item1', 'item2'],
        },
        step2: {
            title: 'Step 2',
            items: ['item3', 'item4', 'item5'],
        },
        step3: {
            title: 'Step 3',
            items: ['item6'],
        },
    },
}

export const exampleCommand = Commands.declare('wizard.example', () => async () => {
    const wizard = buildWizard(example)

    // No type-safety here
    const response = await wizard.run()
    if (!response) {
        return void getLogger().info('User cancelled!')
    }

    for (const [k, v] of Object.entries(response)) {
        getLogger().info(`For "${k}", user picked "${v}"`)
    }

    const logId = getLogger().info('Wizard is done!')
    return Logging.declared.viewLogsAtMessage.execute(logId)
})
