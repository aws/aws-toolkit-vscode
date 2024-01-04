/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as pathutils from '../../../shared/utilities/pathUtils'
import * as testutil from '../../testUtil'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import {
    addInitialLaunchConfiguration,
    getProjectUri,
    samInitTemplateFiles,
    writeToolkitReadme,
} from '../../../lambda/commands/createNewSamApp'
import { LaunchConfiguration } from '../../../shared/debug/launchConfiguration'
import { makeSampleSamTemplateYaml } from '../../shared/cloudformation/cloudformationTestUtils'
import { makeTemporaryToolkitFolder, readFileAsString } from '../../../shared/filesystemUtilities'
import { ExtContext } from '../../../shared/extensions'
import {
    AwsSamDebuggerConfiguration,
    TemplateTargetProperties,
} from '../../../shared/sam/debugger/awsSamDebugConfiguration'
import { normalize } from '../../../shared/utilities/pathUtils'
import { getIdeProperties, isCloud9 } from '../../../shared/extensionUtilities'
import globals from '../../../shared/extensionGlobals'
import { Runtime } from '../../../shared/telemetry/telemetry'
import { stub } from '../../utilities/stubber'
import sinon from 'sinon'

const templateYaml = 'template.yaml'

describe('createNewSamApp', function () {
    let mockLaunchConfiguration: LaunchConfiguration
    let tempFolder: string
    let tempTemplate: vscode.Uri
    let fakeWorkspaceFolder: vscode.WorkspaceFolder
    let fakeContext: ExtContext
    let fakeResponse: { location: vscode.Uri; name: string }
    let fakeTarget: string
    let fakeConfig: vscode.DebugConfiguration
    let addDebugStub: sinon.SinonStub<any[], any>

    beforeEach(async function () {
        mockLaunchConfiguration = stub(LaunchConfiguration, {
            workspaceFolder: undefined,
            scopedResource: vscode.Uri.parse(''),
        })
        fakeContext = await FakeExtensionContext.getFakeExtContext()
        tempFolder = await makeTemporaryToolkitFolder()
        tempTemplate = vscode.Uri.file(path.join(tempFolder, 'test.yaml'))
        fakeTarget = path.join(tempFolder, templateYaml)
        testutil.toFile('target file', fakeTarget)

        fakeWorkspaceFolder = {
            uri: vscode.Uri.file(path.dirname(tempFolder)),
            name: 'It was me, fakeWorkspaceFolder!',
            index: 0,
        }

        fakeConfig = {
            type: 'aws-sam',
            name: 'name',
            request: 'direct-invoke',
            invokeTarget: {
                target: 'template',
                templatePath: '${workspaceFolder}/test.yaml',
                logicalId: 'resource',
            },
        }

        fakeResponse = { location: fakeWorkspaceFolder.uri, name: path.basename(tempFolder) }

        mockLaunchConfiguration.getDebugConfigurations = sinon.stub().returns([fakeConfig])
        addDebugStub = sinon.stub().resolves()
        mockLaunchConfiguration.addDebugConfigurations = addDebugStub
    })

    afterEach(async function () {
        await fs.remove(tempFolder)
        const r = await globals.templateRegistry
        r.reset()
    })

    describe('getProjectUri', function () {
        it('returns the target file when it exists', async function () {
            assert.strictEqual(
                normalize((await getProjectUri(fakeResponse, samInitTemplateFiles))?.fsPath ?? ''),
                normalize(fakeTarget)
            )
        })
        it('returns the target ".yml" file when it exists', async function () {
            fs.unlinkSync(fakeTarget)
            tempTemplate = vscode.Uri.file(path.join(tempFolder, 'test.yml'))
            fakeTarget = path.join(tempFolder, 'template.yml')
            testutil.toFile('target file', fakeTarget)
            assert.strictEqual(
                normalize((await getProjectUri(fakeResponse, samInitTemplateFiles))?.fsPath ?? ''),
                normalize(fakeTarget)
            )
        })
        it('returns undefined when the target does not exist', async function () {
            const badResponse1 = { location: fakeResponse.location, name: 'notreal' }
            const badResponse2 = { location: vscode.Uri.parse('fake://notreal'), name: 'notafile' }
            assert.strictEqual((await getProjectUri(badResponse1, samInitTemplateFiles))?.fsPath, undefined)
            assert.strictEqual((await getProjectUri(badResponse2, samInitTemplateFiles))?.fsPath, undefined)
        })
    })

    describe('addInitialLaunchConfiguration', function () {
        it('produces and returns initial launch configurations', async function () {
            testutil.toFile(makeSampleSamTemplateYaml(true), tempTemplate.fsPath)

            // without runtime
            await (await globals.templateRegistry).addItem(tempTemplate)
            const launchConfigs = await addInitialLaunchConfiguration(
                fakeContext,
                fakeWorkspaceFolder,
                (await getProjectUri(fakeResponse, samInitTemplateFiles))!,
                undefined,
                mockLaunchConfiguration
            )

            const [arg] = addDebugStub.lastCall.args
            assert.ok(
                pathutils.areEqual(
                    fakeWorkspaceFolder.uri.fsPath,
                    (arg[0].invokeTarget as TemplateTargetProperties).templatePath,
                    tempTemplate.fsPath,
                    true
                )
            )
            assert.ok(launchConfigs)
            const matchingConfigs = launchConfigs?.filter(config => {
                return pathutils.areEqual(
                    fakeWorkspaceFolder.uri.fsPath,
                    (config.invokeTarget as TemplateTargetProperties).templatePath,
                    tempTemplate.fsPath,
                    true
                )
            })
            assert.ok(matchingConfigs)
            assert.strictEqual(matchingConfigs!.length, 1)
        })

        it('produces and returns initial launch configurations with runtime', async function () {
            testutil.toFile(makeSampleSamTemplateYaml(true), tempTemplate.fsPath)

            // without runtime
            await (await globals.templateRegistry).addItem(tempTemplate)
            const launchConfigs = (await addInitialLaunchConfiguration(
                fakeContext,
                fakeWorkspaceFolder,
                tempTemplate,
                'someruntime' as Runtime,
                mockLaunchConfiguration
            )) as AwsSamDebuggerConfiguration[]

            const [arg] = addDebugStub.lastCall.args
            assert.ok(
                pathutils.areEqual(
                    fakeWorkspaceFolder.uri.fsPath,
                    (arg[0].invokeTarget as TemplateTargetProperties).templatePath,
                    tempTemplate.fsPath,
                    true
                )
            )
            assert.ok(launchConfigs)
            const matchingConfigs = launchConfigs?.filter(config => {
                return (
                    pathutils.areEqual(
                        fakeWorkspaceFolder.uri.fsPath,
                        (config.invokeTarget as TemplateTargetProperties).templatePath,
                        tempTemplate.fsPath,
                        true
                    ) && config.lambda?.runtime === 'someruntime'
                )
            })
            assert.ok(matchingConfigs)
            assert.strictEqual(matchingConfigs!.length, 1)
        })

        it('returns a blank array if it does not match any launch configs', async function () {
            testutil.toFile(makeSampleSamTemplateYaml(true), tempTemplate.fsPath)

            await (await globals.templateRegistry).addItem(tempTemplate)
            const launchConfigs = await addInitialLaunchConfiguration(
                fakeContext,
                fakeWorkspaceFolder,
                vscode.Uri.file(path.join(tempFolder, 'otherFolder', 'thisAintIt.yaml')),
                undefined,
                mockLaunchConfiguration
            )
            assert.deepStrictEqual(launchConfigs, [])
        })

        it('produces a launch config when config has a relative path', async function () {
            ;(fakeConfig as any).invokeTarget.templatePath = 'test.yaml'

            testutil.toFile(makeSampleSamTemplateYaml(true), tempTemplate.fsPath)

            await (await globals.templateRegistry).addItem(tempTemplate)
            const launchConfigs = await addInitialLaunchConfiguration(
                fakeContext,
                fakeWorkspaceFolder,
                (await getProjectUri(fakeResponse, samInitTemplateFiles))!,
                undefined,
                mockLaunchConfiguration
            )
            assert.ok(launchConfigs?.length !== 0)
        })

        // File structure generated by this test:
        //
        // \---WorkspaceFolder
        //     \---tempFolder
        //         \---test.yaml
        //         \---SAM_INIT_OPEN_TARGET
        //         \---subfolder
        //             \---test.yaml
        //     \---otherFolder
        //         \---test.yaml
        //         \---SAM_INIT_OPEN_TARGET
        //
        it('returns only templates within the same base directory as target', async function () {
            const otherFolder1: string = path.join(fakeWorkspaceFolder.uri.fsPath, 'otherFolder')
            const otherFolder2: string = path.join(tempFolder, 'subfolder')
            const otherTemplate1: vscode.Uri = vscode.Uri.file(path.join(otherFolder1, 'test.yaml'))
            const otherTemplate2: vscode.Uri = vscode.Uri.file(path.join(otherFolder2, 'test.yaml'))

            testutil.toFile(makeSampleSamTemplateYaml(true), tempTemplate.fsPath)
            testutil.toFile(makeSampleSamTemplateYaml(true), otherTemplate1.fsPath)
            testutil.toFile(makeSampleSamTemplateYaml(true), otherTemplate2.fsPath)
            testutil.toFile('target file', path.join(otherFolder1, templateYaml))

            await (await globals.templateRegistry).addItem(tempTemplate)
            await (await globals.templateRegistry).addItem(otherTemplate1)
            await (await globals.templateRegistry).addItem(otherTemplate2)

            const launchConfigs1 = await addInitialLaunchConfiguration(
                fakeContext,
                fakeWorkspaceFolder,
                (await getProjectUri(fakeResponse, samInitTemplateFiles))!,
                undefined,
                mockLaunchConfiguration
            )

            const launchConfigs2 = await addInitialLaunchConfiguration(
                fakeContext,
                fakeWorkspaceFolder,
                (await getProjectUri(
                    { location: fakeWorkspaceFolder.uri, name: 'otherFolder' },
                    samInitTemplateFiles
                ))!,
                undefined,
                mockLaunchConfiguration
            )

            assert.notDeepStrictEqual(launchConfigs1, launchConfigs2)
            assert.strictEqual(launchConfigs1!.length, 2)
            assert.strictEqual(launchConfigs2!.length, 1)
        })
    })

    describe('writeToolkitReadme', async () => {
        let tempPath: string
        before(async () => {
            const dir = await makeTemporaryToolkitFolder()
            tempPath = path.join(dir, 'temp.md')
        })

        it('replaces flags in the file - VS Code', async () => {
            const success = await writeToolkitReadme(
                tempPath,
                [
                    {
                        type: 'foo',
                        name: 'fooName',
                        request: 'fooRequest',
                    },
                    {
                        type: 'bar',
                        name: 'barName',
                        request: 'barRequest',
                    },
                ],
                async (path: string) => {
                    return '${PRODUCTNAME} ${IDE} ${CODELENS} ${COMPANYNAME} ${COMMANDPALETTE} ${DOCURL}${LISTOFCONFIGURATIONS}'
                }
            )

            assert.ok(success)
            const content = await readFileAsString(tempPath)
            assert.strictEqual(
                content,
                `${getIdeProperties().company} Toolkit For ${getIdeProperties().longName} ${
                    getIdeProperties().shortName
                } ${getIdeProperties().codelens} ${getIdeProperties().company} ${getIdeProperties().commandPalette} ${
                    isCloud9()
                        ? 'https://docs.aws.amazon.com/cloud9/latest/user-guide/serverless-apps-toolkit.html'
                        : 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/serverless-apps.html'
                }
* fooName
* barName`
            )
        })
    })
})
