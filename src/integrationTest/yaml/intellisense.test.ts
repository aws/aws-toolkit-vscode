/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as manifest from '../../../package.json'
import * as path from 'path'
import * as fs from 'fs-extra'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as semver from 'semver'
import { getTestWorkspaceFolder, slowTestTimeout } from '../integrationTestsUtilities'
import { activateExtension, getCompletionItems, getHoverItems } from '../../shared/utilities/vsCodeUtils'
import { waitUntil } from '../../shared/utilities/timeoutUtils'
import globals from '../../shared/extensionGlobals'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { YamlExtensionApi } from '../../shared/extensions/yaml'
import { writeTestSchemas } from '../../test/shared/schema/testUtils'
import { BuildspecTemplateRegistry } from '../../shared/buildspec/registry'
import { CloudFormationTemplateRegistry } from '../../shared/fs/templateRegistry'

interface TestScenario {
    name: string
    templateCommand: string
    registry: () => CloudFormationTemplateRegistry | BuildspecTemplateRegistry
}

const scenarios: TestScenario[] = [
    {
        name: 'buildspec',
        templateCommand: 'aws.buildspec.newTemplate',
        registry: () => globals.templateRegistry.buildspec,
    },
    {
        name: 'cloudformation',
        templateCommand: 'aws.cloudFormation.newTemplate',
        registry: () => globals.templateRegistry.cfn,
    },
    {
        name: 'sam',
        templateCommand: 'aws.sam.newTemplate',
        registry: () => globals.templateRegistry.cfn,
    },
]

describe('YAML intellisense', async function () {
    before(async function () {
        // vscode-yaml isn't supported on the minimum toolkit version
        if (semver.minVersion(manifest.engines.vscode)?.compare(vscode.version) !== -1) {
            this.skip()
        }

        await waitUntil(
            async () => {
                const yamlExt = await activateExtension<YamlExtensionApi>(VSCODE_EXTENSION_ID.yaml)
                return yamlExt?.exports?.registerContributor !== undefined
            },
            { timeout: slowTestTimeout }
        )

        // Ensure that all schemas are pre-downloaded before the tests start to prevent rate limiting by github
        await writeTestSchemas(globals.context.globalStorageUri)

        // Re-setup the schema service so that all the locally cached schemas are used, just in case we are rate limited by github
        await globals.schemaService.start()
    })

    for (const scenario of scenarios) {
        describe(`${scenario.name} intellisense`, async function () {
            let workspaceDir: string
            let testDir: string
            let testFileUri: vscode.Uri

            before(async function () {
                workspaceDir = getTestWorkspaceFolder()
                testDir = path.join(workspaceDir, `${scenario.name}-intellisense`)
                testFileUri = vscode.Uri.file(path.join(testDir, 'test.yaml'))
                await fs.mkdirp(testDir)

                sinon.stub(vscode.window, 'showSaveDialog').returns(Promise.resolve(testFileUri))

                await vscode.commands.executeCommand(scenario.templateCommand)

                // Add the test file to the registry right away so we don't have to wait
                await scenario.registry().addItemToRegistry(testFileUri, false)

                // Flush the schema assignments
                await globals.schemaService.processUpdates()
            })

            after(async function () {
                await fs.remove(testDir)
                sinon.restore()
            })

            it(`autocompletes and hovers a ${scenario.name} file`, async function () {
                waitUntil(
                    async () => {
                        return globals.schemaService.isMapped(testFileUri)
                    },
                    { timeout: slowTestTimeout }
                )

                const completions = await getCompletionItems(testFileUri, new vscode.Position(4, 0))
                if (!completions) {
                    assert.fail(`Expected completion items in ${scenario.name} file`)
                }
                const filterTags = completions.items.filter(completion => !completion.label.startsWith('!'))
                assert.notStrictEqual(filterTags.length, 0, 'Expected more than 0 completion items')

                const hovers = await getHoverItems(testFileUri, new vscode.Position(1, 3))
                if (!hovers) {
                    assert.fail(`Expected hover items in ${scenario.name} file`)
                }
                assert.notStrictEqual(hovers.length, 0, 'Expected more than 0 hover items')
            })
        })
    }
})
