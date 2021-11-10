/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { instance, mock, when } from 'ts-mockito'
import { eventBridgeStarterAppTemplate, lazyLoadSamTemplateStrings } from '../../../lambda/models/samTemplates'
import { CreateNewSamAppWizard, CreateNewSamAppWizardForm } from '../../../lambda/wizards/samInitWizard'
import { DefaultSchemaClient } from '../../../shared/clients/schemaClient'
import { ext } from '../../../shared/extensionGlobals'
import { createInputBoxTester, createQuickPickTester } from '../../shared/ui/testUtils'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

describe('CreateNewSamAppWizard', async function () {
    let tester: WizardTester<CreateNewSamAppWizardForm>

    beforeEach(function () {
        tester = createWizardTester(new CreateNewSamAppWizard({ samCliVersion: '1.0.0', schemaRegions: [] }))
    })

    afterEach(function () {
        sinon.restore()
    })

    it('prompts for runtime first', function () {
        tester.runtimeAndPackage.assertShowFirst()
    })

    it('always prompts for at least 4 things', function () {
        tester.assertShowCount(4)
    })

    it('leaves architecture undefined by default', function () {
        tester.architecture.assertValue(undefined)
    })

    it('prompts for dependency manager if there are multiple', function () {
        tester.dependencyManager.assertDoesNotShow()
        tester.runtimeAndPackage.applyInput({ runtime: 'java11', packageType: 'Zip' })
        tester.dependencyManager.assertShow()
    })

    it('always prompts for template after runtime and dependency manager', function () {
        tester.template.assertShowSecond()
        tester.runtimeAndPackage.applyInput({ runtime: 'java11', packageType: 'Zip' })
        tester.template.assertShowSecond()
    })

    it('prompts for location before name', function () {
        tester.runtimeAndPackage.applyInput({ runtime: 'nodejs14.x', packageType: 'Zip' })
        tester.template.applyInput('template')
        tester.location.assertShowFirst()
        tester.name.assertShowSecond()
    })

    it('prompts for schema configuration if a schema template is selected', function () {
        tester.runtimeAndPackage.applyInput({ runtime: 'nodejs14.x', packageType: 'Zip' })
        tester.template.applyInput(eventBridgeStarterAppTemplate)
        tester.region.assertShowFirst()
        tester.registryName.assertShowSecond()
        tester.schemaName.assertShowThird()
    })

    describe('architecture', function () {
        beforeEach(function () {
            tester = createWizardTester(new CreateNewSamAppWizard({ samCliVersion: '1.33.0', schemaRegions: [] }))
        })

        it('prompts for architecture after runtime (no dependency manager) if SAM CLI >= 1.33', function () {
            tester.runtimeAndPackage.applyInput({ runtime: 'python3.9', packageType: 'Zip' })
            tester.architecture.assertShowFirst()
        })

        it('prompts for architecture after the dependency manager if SAM CLI >= 1.33', function () {
            tester.runtimeAndPackage.applyInput({ runtime: 'java11', packageType: 'Zip' })
            tester.dependencyManager.assertShowFirst()
            tester.dependencyManager.applyInput('gradle')
            tester.architecture.assertShowFirst()
        })

        it('skips prompt for earlier versions of SAM CLI', function () {
            tester = createWizardTester(new CreateNewSamAppWizard({ samCliVersion: '1.32.0', schemaRegions: [] }))
            tester.runtimeAndPackage.applyInput({ runtime: 'java11', packageType: 'Zip' })
            tester.architecture.assertDoesNotShow()
        })

        it('skips prompt if runtime has no ARM support', function () {
            tester.runtimeAndPackage.applyInput({ runtime: 'go1.x', packageType: 'Zip' })
            tester.architecture.assertDoesNotShow()
        })

        it('skips prompt for maven + Image type', function () {
            tester.runtimeAndPackage.applyInput({ runtime: 'java11', packageType: 'Image' })
            tester.dependencyManager.applyInput('maven')
            tester.architecture.assertDoesNotShow()
        })
    })

    it('shows runtimes SAM has available with dependency manager', async function () {
        await tester.runtimeAndPackage.runPrompt(prompter => createQuickPickTester(prompter).acceptItem('java11'))
        await tester.dependencyManager.runPrompt(prompter => createQuickPickTester(prompter).acceptItem('gradle'))
    })

    const iter = <T>(...arr: T[]) => {
        return async function* () {
            yield* arr
        }
    }

    it('smoke test - full flow with schemas (python3.9)', async function () {
        const tmp = await makeTemporaryToolkitFolder()
        const folders = [{ name: 'test', uri: vscode.Uri.file(tmp), index: 1 }]
        const registryName = 'aws.events'
        const schemaName = 'aws.a4b@RoomStateChange'
        const schemaClient = mock(DefaultSchemaClient)

        ext.toolkitClientBuilder ??= {} as any
        sinon.stub(vscode.workspace, 'workspaceFolders').value(folders)
        sinon.stub(ext, 'toolkitClientBuilder').value({
            createSchemaClient() {
                return instance(schemaClient)
            },
        })
        when(schemaClient.listRegistries()).thenCall(iter({ RegistryName: registryName }))
        when(schemaClient.listSchemas(registryName)).thenCall(iter({ SchemaName: schemaName }))

        lazyLoadSamTemplateStrings()

        const schemaRegions = [
            { name: 'US East (N. Virginia)', id: 'us-east-1' },
            { name: 'US West (Oregon)', id: 'us-west-2' },
        ]
        const samCliVersion = '1.33.0'
        const tester = createWizardTester(new CreateNewSamAppWizard({ samCliVersion, schemaRegions }))

        await tester.runtimeAndPackage.runPrompt(prompter => createQuickPickTester(prompter).acceptItem('python3.9'))
        await tester.architecture.runPrompt(prompter => createQuickPickTester(prompter).acceptItem('arm64'))
        await tester.template.runPrompt(prompter =>
            createQuickPickTester(prompter).acceptItem('AWS SAM EventBridge App from Scratch')
        )
        await tester.region.runPrompt(prompter => createQuickPickTester(prompter).acceptItem(schemaRegions[1].name))
        await tester.registryName.runPrompt(prompter => createQuickPickTester(prompter).acceptItem(registryName))
        await tester.schemaName.runPrompt(prompter => createQuickPickTester(prompter).acceptItem(schemaName))
        await tester.location.runPrompt(prompter => createQuickPickTester(prompter).acceptItem(/test/))
        await tester.name.runPrompt(prompter => createInputBoxTester(prompter).assertValue('lambda-python3.9').submit())

        tester.runtimeAndPackage.assertValue({ runtime: 'python3.9', packageType: 'Zip' })
        tester.dependencyManager.assertValue('pip')
        tester.architecture.assertValue('arm64')
        tester.template.assertValue('AWS SAM EventBridge App from Scratch')
        tester.region.assertValue('us-west-2')
        tester.registryName.assertValue(registryName)
        tester.schemaName.assertValue(schemaName)
        tester.location.assertValue(folders[0].uri)
        tester.name.assertValue('lambda-python3.9')
    })
})
