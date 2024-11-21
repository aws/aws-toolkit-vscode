/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { PrompterTester } from '../../../shared/wizards/prompterTester'
import assert from 'assert'
import { DeployTypeWizard } from '../../../../awsService/appBuilder/wizards/deployTypeWizard'
import { getSyncWizard } from '../../../../shared/sam/sync'
import { TestFolder } from '../../../testUtil'
import { samconfigCompleteData, validTemplateData } from '../../../shared/sam/samTestUtils'
import { getDeployWizard } from '../../../../shared/sam/deploy'

describe('DeployTypeWizard', function () {
    let testFolder: TestFolder
    let templateFile: vscode.Uri
    let syncWizard: any
    let deployWizard: any

    let deployTypeWizard: DeployTypeWizard

    before(async () => {
        testFolder = await TestFolder.create()
        templateFile = vscode.Uri.file(await testFolder.write('template.yaml', validTemplateData))
        await testFolder.write('samconfig.toml', samconfigCompleteData)

        deployWizard = await getDeployWizard(templateFile)
        syncWizard = await getSyncWizard('infra', templateFile, undefined, false)
    })

    it('customer abort wizard should not call any command function', async function () {
        // Given
        const prompterTester = PrompterTester.init()
            .handleQuickPick('Select deployment command', async (picker) => {
                await picker.untilReady()
                assert.strictEqual(picker.items[0].label, 'Sync')
                assert.strictEqual(picker.items[1].label, 'Deploy')
                assert.strictEqual(picker.items.length, 2)
                picker.dispose()
            })
            .build()
        deployTypeWizard = new DeployTypeWizard(syncWizard, deployWizard)
        const choices = await deployTypeWizard.run()
        // Then
        assert(!choices)
        prompterTester.assertCall('Select deployment command', 1)
    })

    it('deploy is selected', async function () {
        /**
         * This test focus on that deploy wizard get triggered when customer choose to use sam deploy
         * Selection for deploy wizard speficy here focus on only one case
         * More cases are test in Deploy.test.ts
         *
         */
        const prompterTester = PrompterTester.init()
            .handleQuickPick('Select deployment command', async (picker) => {
                await picker.untilReady()
                assert.strictEqual(picker.items[0].label, 'Sync')
                assert.strictEqual(picker.items[1].label, 'Deploy')
                assert.strictEqual(picker.items.length, 2)
                picker.acceptItem(picker.items[1])
            })
            .handleInputBox('Specify SAM parameter value for SourceBucketName', (inputBox) => {
                inputBox.acceptValue('my-source-bucket-name')
            })
            .handleInputBox('Specify SAM parameter value for DestinationBucketName', (inputBox) => {
                inputBox.acceptValue('my-destination-bucket-name')
            })
            .handleQuickPick('Specify parameter source for deploy', async (quickPick) => {
                // Need time to check samconfig.toml file and generate options
                await quickPick.untilReady()
                assert.strictEqual(quickPick.items[2].label, 'Use default values from samconfig')
                quickPick.acceptItem(quickPick.items[2])
            })
            .build()
        deployTypeWizard = new DeployTypeWizard(syncWizard, deployWizard)
        const choices = await deployTypeWizard.run()
        // Then
        assert.strictEqual(choices?.choice, 'deploy')
        prompterTester.assertCallAll()
    })

    it('sync is selected', async function () {
        /**
         * This test focus on that sync wizard get triggered when customer choose to use sam sync
         * Selection for deploy wizard speficy here focus on only one case
         * More cases are test in Sync.test.ts
         *
         */
        const prompterTester = PrompterTester.init()
            .handleQuickPick('Select deployment command', async (picker) => {
                await picker.untilReady()
                assert.strictEqual(picker.items[0].label, 'Sync')
                assert.strictEqual(picker.items[1].label, 'Deploy')
                assert.strictEqual(picker.items.length, 2)
                picker.acceptItem(picker.items[0])
            })
            .handleQuickPick('Specify parameter source for sync', async (quickPick) => {
                // Need time to check samconfig.toml file and generate options
                await quickPick.untilReady()
                assert.strictEqual(quickPick.items[2].label, 'Use default values from samconfig')
                quickPick.acceptItem(quickPick.items[2])
            })
            .build()
        deployTypeWizard = new DeployTypeWizard(syncWizard, deployWizard)
        const choices = await deployTypeWizard.run()
        // Then
        assert.strictEqual(choices?.choice, 'sync')
        prompterTester.assertCallAll()
    })
})
