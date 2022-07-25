/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import {
    SearchLogGroupWizard,
    createFilterpatternPrompter,
    searchLogGroup,
} from '../../../cloudWatchLogs/commands/searchLogGroup'
import { exposeEmitters, ExposeEmitters } from '../../../../src/test/shared/vscode/testUtils'
import { InputBoxPrompter } from '../../../shared/ui/inputPrompter'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { LogStreamRegistry, ActiveTab } from '../../../cloudWatchLogs/registry/logStreamRegistry'
import { Settings } from '../../../shared/settings'
import { CloudWatchLogsSettings } from '../../../cloudWatchLogs/cloudWatchLogsUtils'
import { LogGroupNode } from '../../../cloudWatchLogs/explorer/logGroupNode'

describe('searchLogGroup', async function () {
    const fakeLogGroups: string[] = []
    let registry: LogStreamRegistry
    let inputBox: ExposeEmitters<vscode.InputBox, 'onDidAccept' | 'onDidChangeValue' | 'onDidTriggerButton'>
    let testPrompter: InputBoxPrompter
    let testWizard: WizardTester<SearchLogGroupWizard>

    before(function () {
        fakeLogGroups.push('group-1', 'group-2', 'group-3')
        testPrompter = createFilterpatternPrompter()

        const config = new Settings(vscode.ConfigurationTarget.Workspace)
        registry = new LogStreamRegistry(new CloudWatchLogsSettings(config), new Map<string, ActiveTab>())
        inputBox = exposeEmitters(testPrompter.inputBox, ['onDidAccept', 'onDidChangeValue', 'onDidTriggerButton'])
    })

    beforeEach(function () {
        testWizard = createWizardTester(new SearchLogGroupWizard())
    })

    it('shows logGroup prompt first and filterPattern second', function () {
        testWizard.submenuResponse.assertShowFirst()
        testWizard.filterPattern.assertShowSecond()
    })

    it('filterPattern InputBox accepts input', async function () {
        /** Sets the input box's value then fires an accept event */
        // copied from 'src/test/shared/ui/inputPrompter.test.ts'
        function accept(value: string): void {
            inputBox.value = value
            inputBox.fireOnDidAccept()
        }

        const testInput = 'this is my filterPattern'
        const result = testPrompter.prompt()
        accept(testInput)
        assert.strictEqual(await result, testInput)
    })

    it('wizaard prioritizes logGroupInfo if passed in', async function () {
        const fakeLogGroupNode = {
            regionCode: 'test-region',
            logGroup: {
                logGroupName: 'test',
            },
        } as LogGroupNode

        assert(fakeLogGroupNode.logGroup.logGroupName) // to avoid linting error

        const nodeTestWizard = createWizardTester(
            new SearchLogGroupWizard({
                groupName: fakeLogGroupNode.logGroup.logGroupName,
                regionName: fakeLogGroupNode.regionCode,
            })
        )
        nodeTestWizard.filterPattern.assertShowFirst()
    })
})
