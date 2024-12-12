/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { createCommonButtons } from '../../../shared/ui/buttons'
import { NestedWizard } from '../../../shared/ui/nestedWizardPrompter'
import { createQuickPick, DataQuickPickItem } from '../../../shared/ui/pickerPrompter'
import * as assert from 'assert'
import { PrompterTester } from './prompterTester'
import { TestQuickPick } from '../vscode/quickInput'

interface ChildWizardForm {
    childWizardProp1: string
    childWizardProp2: string
    childWizardProp3: string
}

interface SingleNestedWizardForm {
    singleNestedWizardProp1: string
    singleNestedWizardProp2: string
    singleNestedWizardNestedProp: any
    singleNestedWizardProp3: string
}

interface DoubleNestedWizardForm {
    doubleNestedWizardProp1: string
    doubleNestedWizardProp2: string
    doubleNestedWizardNestedProp: any
    singleNestedWizardConditionalSkipProps: any
    doubleNestedWizardProp3: string
}

export function createTestPrompter(title: string, itemsString: string[]) {
    const items: DataQuickPickItem<string>[] = itemsString.map((s) => ({
        label: s,
        data: s,
    }))

    return createQuickPick(items, { title: title, buttons: createCommonButtons() })
}

class ChildWizard extends NestedWizard<ChildWizardForm> {
    constructor() {
        super()
        this.form.childWizardProp1.bindPrompter(() =>
            createTestPrompter('ChildWizard Prompter 1', ['c1p1', '**', '***'])
        )
        this.form.childWizardProp2.bindPrompter(() =>
            createTestPrompter('ChildWizard Prompter 2', ['c2p1', '**', '***'])
        )
        this.form.childWizardProp3.bindPrompter(() =>
            createTestPrompter('ChildWizard Prompter 3', ['c3p1', '**', '***'])
        )
    }
}

class SingleNestedWizard extends NestedWizard<SingleNestedWizardForm> {
    constructor() {
        super()

        this.form.singleNestedWizardProp1.bindPrompter(() =>
            createTestPrompter('SingleNestedWizard Prompter 1', ['s1p1', '**', '***'])
        )
        this.form.singleNestedWizardProp2.bindPrompter(() =>
            createTestPrompter('SingleNestedWizard Prompter 2', ['s2p1', '**', '***'])
        )
        this.form.singleNestedWizardNestedProp.bindPrompter(() =>
            this.createWizardPrompter<ChildWizard, ChildWizardForm>(ChildWizard)
        )
        this.form.singleNestedWizardProp3.bindPrompter(() =>
            createTestPrompter('SingleNestedWizard Prompter 3', ['s3p1', '**', '***'])
        )
    }
}

class DoubleNestedWizard extends NestedWizard<DoubleNestedWizardForm> {
    constructor() {
        super()

        this.form.doubleNestedWizardProp1.bindPrompter(() =>
            createTestPrompter('DoubleNestedWizard Prompter 1', ['d1p1', '**', '***'])
        )
        this.form.doubleNestedWizardProp2.bindPrompter(() =>
            createTestPrompter('DoubleNestedWizard Prompter 2', ['d2p1', '**', '***'])
        )
        this.form.doubleNestedWizardNestedProp.bindPrompter(() =>
            this.createWizardPrompter<SingleNestedWizard, SingleNestedWizardForm>(SingleNestedWizard)
        )
        this.form.doubleNestedWizardProp3.bindPrompter(() =>
            createTestPrompter('DoubleNestedWizard Prompter 3', ['d3p1', '**', '***'])
        )
    }
}

describe('NestedWizard', () => {
    it('return the correct output from nested child wizard', async () => {
        /**
         * SingleNestedWizard
            |
            +-- Prompter 1
            |
            +-- Prompter 2
            |
            +-- ChildWizard
            |   |
            |   +-- Prompter 1
            |   |
            |   +-- Prompter 2
            |   |
            |   +-- Prompter 3
            |
            +-- Prompter 3
         */
        const expectedCallOrders = [
            'SingleNestedWizard Prompter 1',
            'SingleNestedWizard Prompter 2',
            'ChildWizard Prompter 1',
            'ChildWizard Prompter 2',
            'ChildWizard Prompter 3',
            'SingleNestedWizard Prompter 3',
        ]
        const expectedOutput = {
            singleNestedWizardProp1: 's1p1',
            singleNestedWizardProp2: 's2p1',
            singleNestedWizardNestedProp: {
                childWizardProp1: 'c1p1',
                childWizardProp2: 'c2p1',
                childWizardProp3: 'c3p1',
            },
            singleNestedWizardProp3: 's3p1',
        }

        const prompterTester = setupPrompterTester(expectedCallOrders)

        const parentWizard = new SingleNestedWizard()
        const result = await parentWizard.run()
        assertWizardOutput(prompterTester, expectedCallOrders, result, expectedOutput)
    })

    it('return the correct output from double nested child wizard', async () => {
        /**
         * DoubleNestedWizard
            |
            +-- Prompter 1
            |
            +-- Prompter 2
            |
            +-- SingleNestedWizard
            |       |
            |       +-- Prompter 1
            |       |
            |       +-- Prompter 2
            |       |
            |       +-- ChildWizard
            |       |       |
            |       |       +-- Prompter 1
            |       |       |
            |       |       +-- Prompter 2
            |       |       |
            |       |       +-- Prompter 3
            |       |
            |       +-- Prompter 3
            |
            +-- Prompter 3
         */
        const expectedCallOrders = [
            'DoubleNestedWizard Prompter 1',
            'DoubleNestedWizard Prompter 2',
            'SingleNestedWizard Prompter 1',
            'SingleNestedWizard Prompter 2',
            'ChildWizard Prompter 1',
            'ChildWizard Prompter 2',
            'ChildWizard Prompter 3',
            'SingleNestedWizard Prompter 3',
            'DoubleNestedWizard Prompter 3',
        ]
        const expectedOutput = {
            doubleNestedWizardProp1: 'd1p1',
            doubleNestedWizardProp2: 'd2p1',
            doubleNestedWizardNestedProp: {
                singleNestedWizardProp1: 's1p1',
                singleNestedWizardProp2: 's2p1',
                singleNestedWizardNestedProp: {
                    childWizardProp1: 'c1p1',
                    childWizardProp2: 'c2p1',
                    childWizardProp3: 'c3p1',
                },
                singleNestedWizardProp3: 's3p1',
            },
            doubleNestedWizardProp3: 'd3p1',
        }

        const prompterTester = setupPrompterTester(expectedCallOrders)

        const parentWizard = new DoubleNestedWizard()
        const result = await parentWizard.run()

        assertWizardOutput(prompterTester, expectedCallOrders, result, expectedOutput)
    })

    it('regenerates child wizard prompters in correct reverse order when going backward (back button)', async () => {
        /**
         * DoubleNestedWizard
            |
            +--> Prompter 1 (1)
            |
            +--> Prompter 2 (2)
            |
            |    SingleNestedWizard
            |        |
            |        +--> Prompter 1 (3)
            |        |
            |        +--> Prompter 2 (4)
            |        |
            |        |    ChildWizard
            |        |        |
            |        |        +--> Prompter 1 (5)
            |        |        |
            |        |        +--> Prompter 2 (6)
            |        |        |
            |        |        +--> Prompter 3 (7)
            |        |        |
            |        |        +--> Prompter 2 (8) <-- Back
            |        |        |
            |        |        +--> Prompter 1 (9) <-- Back
            |        |        |
            |        |        +--> Prompter 2 (10)
            |        |        |
            |        |        +--> Prompter 3 (11)
            |        |
            |        +--> Prompter 3 (12)
            |
            +--> Prompter 3 (13) <-- Back
            |
            |    SingleNestedWizard
            |        |
            |        +--> Prompter 3 (14) <-- Back
            |        |
            |        |    ChildWizard
            |        |        |
            |        |        +--> Prompter 3 (15)
            |        |
            |        +--> Prompter 3 (16)
            |
            +--> Prompter 3 (17)

         */
        const expectedCallOrders = [
            'DoubleNestedWizard Prompter 1', // 1
            'DoubleNestedWizard Prompter 2', // 2
            'SingleNestedWizard Prompter 1', // 3
            'SingleNestedWizard Prompter 2', // 4
            'ChildWizard Prompter 1', // 5
            'ChildWizard Prompter 2', // 6
            'ChildWizard Prompter 3', // 7 (Back button)
            'ChildWizard Prompter 2', // 8 (Back button)
            'ChildWizard Prompter 1', // 9
            'ChildWizard Prompter 2', // 10
            'ChildWizard Prompter 3', // 11
            'SingleNestedWizard Prompter 3', // 12
            'DoubleNestedWizard Prompter 3', // 13 (Back button)
            'SingleNestedWizard Prompter 3', // 14 (Back button)
            'ChildWizard Prompter 3', // 15
            'SingleNestedWizard Prompter 3', // 16
            'DoubleNestedWizard Prompter 3', // 17
        ]
        const prompterTester = PrompterTester.init()
            .handleQuickPick('DoubleNestedWizard Prompter 1', (quickPick) => {
                // 1st
                quickPick.acceptItem(quickPick.items[0])
            })
            .handleQuickPick('DoubleNestedWizard Prompter 2', (quickPick) => {
                // 2nd
                quickPick.acceptItem(quickPick.items[0])
            })
            .handleQuickPick('SingleNestedWizard Prompter 1', (quickPick) => {
                // 3rd
                quickPick.acceptItem(quickPick.items[0])
            })
            .handleQuickPick('SingleNestedWizard Prompter 2', (quickPick) => {
                // 4th
                quickPick.acceptItem(quickPick.items[0])
            })
            .handleQuickPick('ChildWizard Prompter 1', (quickPick) => {
                // 5th
                // 9th
                quickPick.acceptItem(quickPick.items[0])
            })
            .handleQuickPick(
                'ChildWizard Prompter 2',
                (() => {
                    const generator = (function* () {
                        // 6th
                        // First call, choose '**'
                        yield async (picker: TestQuickPick) => {
                            await picker.untilReady()
                            assert.strictEqual(picker.items[1].label, '**')
                            picker.acceptItem(picker.items[1])
                        }
                        //  8th
                        yield async (picker: TestQuickPick) => {
                            await picker.untilReady()
                            picker.pressButton(vscode.QuickInputButtons.Back)
                        }
                        //  10th
                        // Second call and subsequent call, should restore previously selected option  (**)
                        while (true) {
                            yield async (picker: TestQuickPick) => {
                                await picker.untilReady()
                                picker.acceptItem(picker.items[1])
                            }
                        }
                    })()

                    return (picker: TestQuickPick) => {
                        const next = generator.next().value
                        return next(picker)
                    }
                })()
            )
            .handleQuickPick(
                'ChildWizard Prompter 3',
                (() => {
                    const generator = (function* () {
                        //  7th
                        // First call, check Back Button
                        yield async (picker: TestQuickPick) => {
                            await picker.untilReady()
                            picker.pressButton(vscode.QuickInputButtons.Back)
                        }
                        // 11th
                        // 15th
                        while (true) {
                            yield async (picker: TestQuickPick) => {
                                await picker.untilReady()
                                picker.acceptItem(picker.items[0])
                            }
                        }
                    })()

                    return (picker: TestQuickPick) => {
                        const next = generator.next().value
                        return next(picker)
                    }
                })()
            )
            .handleQuickPick(
                'SingleNestedWizard Prompter 3',
                (() => {
                    const generator = (function* () {
                        //  12th
                        // First call, choose '***'
                        yield async (picker: TestQuickPick) => {
                            await picker.untilReady()
                            assert.strictEqual(picker.items[2].label, '***')
                            picker.acceptItem(picker.items[2])
                        }
                        //  14th
                        yield async (picker: TestQuickPick) => {
                            await picker.untilReady()
                            picker.pressButton(vscode.QuickInputButtons.Back)
                        }
                        // 16th
                        // Second call and after should restore previously selected option  (**)
                        while (true) {
                            yield async (picker: TestQuickPick) => {
                                await picker.untilReady()
                                picker.acceptItem(picker.items[2])
                            }
                        }
                    })()

                    return (picker: TestQuickPick) => {
                        const next = generator.next().value
                        return next(picker)
                    }
                })()
            )
            .handleQuickPick(
                'DoubleNestedWizard Prompter 3',
                (() => {
                    const generator = (function* () {
                        // 13th
                        // First call, check Back Button
                        yield async (picker: TestQuickPick) => {
                            await picker.untilReady()
                            picker.pressButton(vscode.QuickInputButtons.Back)
                        }
                        // 17th
                        // Default behavior for any subsequent calls
                        while (true) {
                            yield async (picker: TestQuickPick) => {
                                await picker.untilReady()
                                picker.acceptItem(picker.items[0])
                            }
                        }
                    })()

                    return (picker: TestQuickPick) => {
                        const next = generator.next().value
                        return next(picker)
                    }
                })()
            )
            .build()

        const parentWizard = new DoubleNestedWizard()

        const result = await parentWizard.run()

        assertWizardOutput(prompterTester, expectedCallOrders, result, {
            doubleNestedWizardProp1: 'd1p1',
            doubleNestedWizardProp2: 'd2p1',
            doubleNestedWizardNestedProp: {
                singleNestedWizardProp1: 's1p1',
                singleNestedWizardProp2: 's2p1',
                singleNestedWizardNestedProp: {
                    childWizardProp1: 'c1p1',
                    childWizardProp2: '**',
                    childWizardProp3: 'c3p1',
                },
                singleNestedWizardProp3: '***',
            },
            doubleNestedWizardProp3: 'd3p1',
        })
    })
})

function setupPrompterTester(titles: string[]) {
    const prompterTester = PrompterTester.init()
    titles.forEach((title) => {
        prompterTester.handleQuickPick(title, (quickPick) => {
            quickPick.acceptItem(quickPick.items[0])
        })
    })
    prompterTester.build()
    return prompterTester
}

function assertWizardOutput(prompterTester: PrompterTester, orderedTitle: string[], result: any, output: any) {
    assert.deepStrictEqual(result, output)
    orderedTitle.forEach((title, index) => {
        prompterTester.assertCallOrder(title, index + 1)
    })
}
