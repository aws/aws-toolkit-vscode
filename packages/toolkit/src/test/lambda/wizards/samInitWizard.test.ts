/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { eventBridgeStarterAppTemplate } from '../../../lambda/models/samTemplates'
import { CreateNewSamAppWizard, CreateNewSamAppWizardForm } from '../../../lambda/wizards/samInitWizard'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'

describe('CreateNewSamAppWizard', async function () {
    let tester: WizardTester<CreateNewSamAppWizardForm>

    beforeEach(async function () {
        tester = await createWizardTester(new CreateNewSamAppWizard({ samCliVersion: '1.0.0', schemaRegions: [] }))
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
        tester.runtimeAndPackage.applyInput({ runtime: 'nodejs20.x', packageType: 'Zip' })
        tester.template.applyInput('template')
        tester.location.assertShowFirst()
        tester.name.assertShowSecond()
    })

    it('prompts for schema configuration if a schema template is selected', function () {
        tester.runtimeAndPackage.applyInput({ runtime: 'nodejs20.x', packageType: 'Zip' })
        tester.template.applyInput(eventBridgeStarterAppTemplate)
        tester.region.assertShowFirst()
        tester.registryName.assertShowSecond()
        tester.schemaName.assertShowThird()
    })

    describe('architecture', function () {
        beforeEach(async function () {
            tester = await createWizardTester(new CreateNewSamAppWizard({ samCliVersion: '1.33.0', schemaRegions: [] }))
        })

        it('prompts for architecture after runtime (no dependency manager) if SAM CLI >= 1.33', function () {
            tester.runtimeAndPackage.applyInput({ runtime: 'python3.9', packageType: 'Zip' })
            tester.architecture.assertShowFirst()
        })

        it('prompts for architecture after the dependency manager if SAM CLI >= 1.33', function () {
            tester.runtimeAndPackage.applyInput({ runtime: 'java11', packageType: 'Zip' })
            tester.dependencyManager.assertShowFirst()
            tester.architecture.assertShowSecond()
        })

        it('skips prompt for earlier versions of SAM CLI', async function () {
            tester = await createWizardTester(new CreateNewSamAppWizard({ samCliVersion: '1.32.0', schemaRegions: [] }))
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
})
