/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import {
    createParametersPrompter,
    createSamTemplatePrompter,
    SamDeployWizard,
    SamDeployWizardResponse,
} from '../../../lambda/wizards/samDeployWizard'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { ExtContext } from '../../../shared/extensions'
import { createWizardTester, WizardTester } from '../../shared/wizards/wizardTestUtils'
import { createQuickPickTester, QuickPickTester } from '../../shared/ui/testUtils'
import * as configureParameterOverrides from '../../../lambda/config/configureParameterOverrides'
import * as parameterUtils from '../../../lambda/config/parameterUtils'
import * as localizedText from '../../../shared/localizedText'
import { ext } from '../../../shared/extensionGlobals'
import { getTestWorkspaceFolder } from '../../../integrationTest/integrationTestsUtilities'
import {
    createBaseImageTemplate,
    makeSampleSamTemplateYaml,
    strToYamlFile,
} from '../../shared/cloudformation/cloudformationTestUtils'
import { WizardControl } from '../../../shared/wizards/util'

let extContext: ExtContext

before(async function () {
    extContext = await FakeExtensionContext.getFakeExtContext()
    ext.toolkitClientBuilder = {
        createEcrClient: () => ({} as any),
    } as any
})

describe('SamDeployWizard', async function () {
    let tester: WizardTester<SamDeployWizard>

    beforeEach(function () {
        tester = createWizardTester(new SamDeployWizard(extContext))
    })

    it('has 4 steps by default', function () {
        tester.assertShowCount(4)
    })

    it('prompts for template first', function () {
        tester.template.assertShowFirst()
    })

    it('prompts for region if not assigned', function () {
        tester.region.assertShow()
    })

    it('skips region if assigned', function () {
        tester = createWizardTester(new SamDeployWizard(extContext, 'region'))
        tester.region.assertDoesNotShow()
    })

    it('skips template picker if assigned', async function () {
        tester.template.applyInput({ uri: vscode.Uri.file('') })
        tester.template.assertDoesNotShow()
    })

    it('skips configuring overrides and continues wizard if `parameterOverrides` is defined', async function () {
        tester.template.applyInput({ uri: vscode.Uri.file(''), parameterOverrides: new Map() })
        tester.template.parameterOverrides.assertDoesNotShow()
    })

    it('prompts for ECR repository after region if template is an image', async function () {
        tester.template.applyInput({
            ...createBaseImageTemplate(),
            uri: vscode.Uri.file(''),
            parameterOverrides: new Map(),
        })
        // TODO: currently assertions are conservative when a `showWhen` clause exists, meaning a value needs to be applied
        // to all dependencies even if they're not used in the predicate. Future work should refine the predicates to
        // specifiy their exact dependencies.
        tester.ecrRepo.assertDoesNotShow()
        tester.region.applyInput('')
        tester.ecrRepo.assertShow()
    })
})

describe('createParametersPrompter', function () {
    const templateUri = vscode.Uri.file('')
    let tester: QuickPickTester<Map<string, string>>
    let configureStub: sinon.SinonStub<
        Parameters<typeof configureParameterOverrides['configureParameterOverrides']>,
        ReturnType<typeof configureParameterOverrides['configureParameterOverrides']>
    >

    before(function () {
        configureStub = sinon.stub(configureParameterOverrides, 'configureParameterOverrides')
    })

    beforeEach(function () {
        tester = createQuickPickTester(createParametersPrompter({ uri: templateUri }))
        configureStub.reset()
    })

    it('skips configuring overrides and continues wizard', async function () {
        tester.acceptItem(localizedText.no)
        assert.ok((await tester.result()) instanceof Map)
    })

    it('configures overrides and exits wizard', async function () {
        tester.acceptItem(localizedText.yes)
        assert.strictEqual(await tester.result(), WizardControl.ForceExit)
        assert.strictEqual(configureStub.callCount, 1)
    })

    it('presents a mandatory prompt when missing parameters is not empty', async function () {
        tester = createQuickPickTester(
            createParametersPrompter({
                uri: templateUri,
                missingParameters: new Set('x'),
            })
        )
        tester.acceptItem('Configure')
        assert.strictEqual(await tester.result(), WizardControl.ForceExit)
        assert.strictEqual(configureStub.callCount, 1)
    })

    it('presents a mandatory prompt when missing parameters is not empty ("cancel")', async function () {
        tester = createQuickPickTester(
            createParametersPrompter({
                uri: templateUri,
                missingParameters: new Set('x'),
            })
        )
        tester.acceptItem(localizedText.cancel)
        assert.strictEqual(await tester.result(), WizardControl.ForceExit)
        assert.strictEqual(configureStub.callCount, 0)
    })
})

function isTemplateResult(obj: any): asserts obj is SamDeployWizardResponse['template'] {
    assert.notStrictEqual(obj.uri, undefined)
}

describe('createSamTemplatePrompter', function () {
    type Params = typeof parameterUtils['getParameters']
    type Overrides = typeof parameterUtils['getOverriddenParameters']
    let tester: QuickPickTester<SamDeployWizardResponse['template']>
    let parametersStub: sinon.SinonStub<Parameters<Params>, ReturnType<Params>>
    let overridesStub: sinon.SinonStub<Parameters<Overrides>, ReturnType<Overrides>>
    let testDir: string

    before(async function () {
        parametersStub = sinon.stub(parameterUtils, 'getParameters')
        overridesStub = sinon.stub(parameterUtils, 'getOverriddenParameters')
        testDir = path.join(getTestWorkspaceFolder(), 'paramTest')
        await fs.mkdirp(testDir)
    })

    beforeEach(async function () {
        await strToYamlFile(makeSampleSamTemplateYaml(true), path.join(testDir, 'template.yml'))
        await ext.templateRegistry.addItemToRegistry(vscode.Uri.file(path.join(testDir, 'template.yml')))
        tester = createQuickPickTester(createSamTemplatePrompter(extContext.samCliContext()))
    })

    after(async function () {
        await fs.remove(testDir)
    })

    const testPath = path.join('paramTest', 'template.yml')

    it('presents list of templates', async function () {
        tester.acceptItem(testPath)
        const result = await tester.result()
        isTemplateResult(result)
    })

    it('returns no parameter overrides if undefined or empty parameters', async function () {
        tester.acceptItem(testPath)
        const result = await tester.result()
        isTemplateResult(result)
        assert.strictEqual(result.parameterOverrides?.size, 0)
    })

    it('checks for required parameters', async function () {
        parametersStub.returns(
            Promise.resolve(new Map<string, { required: boolean }>([['myParam', { required: true }]]))
        )
        tester.acceptItem(testPath)
        const result = await tester.result()
        isTemplateResult(result)
        assert.deepStrictEqual([...(result.missingParameters?.keys() ?? [])], ['myParam'])
    })

    it('checks for optional parameters', async function () {
        parametersStub.returns(
            Promise.resolve(new Map<string, { required: boolean }>([['myParam', { required: false }]]))
        )
        tester.acceptItem(testPath)
        const result = await tester.result()
        isTemplateResult(result)
        assert.strictEqual(result.missingParameters, undefined)
    })

    it('uses overridden parameters', async function () {
        parametersStub.returns(
            Promise.resolve(new Map<string, { required: boolean }>([['myParam', { required: true }]]))
        )
        overridesStub.returns(Promise.resolve(new Map<string, string>([['myParam', 'override']])))
        tester.acceptItem(testPath)
        const result = await tester.result()
        isTemplateResult(result)
        assert.strictEqual(result.missingParameters, undefined)
        assert.strictEqual(result.parameterOverrides?.size, 1)
    })

    // TODO: test for workspace folder label
})
