/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'

import {
    CloudFormationTemplateRegistry,
    getResourcesForHandler,
    getResourcesForHandlerFromTemplateDatum,
} from '../../../shared/cloudformation/templateRegistry'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { assertThrowsError } from '../utilities/assertUtils'
import { badYaml, makeSampleSamTemplateYaml, strToYamlFile } from './cloudformationTestUtils'
import { assertEqualPaths } from '../../testUtil'
import { CloudFormation } from '../../../shared/cloudformation/cloudformation'
import { WatchedItem } from '../../../shared/watchedFiles'

// TODO almost all of these tests should be moved to test WatchedFiles instead
describe('CloudFormation Template Registry', async () => {
    const goodYaml1 = makeSampleSamTemplateYaml(false)

    describe('CloudFormationTemplateRegistry', async () => {
        let testRegistry: CloudFormationTemplateRegistry
        let tempFolder: string

        beforeEach(async () => {
            tempFolder = await makeTemporaryToolkitFolder()
            testRegistry = new CloudFormationTemplateRegistry()
        })

        afterEach(async () => {
            await fs.remove(tempFolder)
        })

        describe('addItemToRegistry', async () => {
            it("adds data from a template to the registry and can receive the template's data", async () => {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                await testRegistry.addItemToRegistry(filename)

                assert.strictEqual(testRegistry.registeredItems.length, 1)

                const data = testRegistry.getRegisteredItem(filename.fsPath)

                assertValidTestTemplate(data, filename.fsPath)
            })

            it('throws an error if the file to add is not a CF template', async () => {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(badYaml, filename.fsPath)

                await assertThrowsError(
                    async () => await testRegistry.addItemToRegistry(vscode.Uri.file(filename.fsPath))
                )
            })
        })

        // other get cases are tested in the add section
        describe('registeredItems', async () => {
            it('returns an empty array if the registry has no registered templates', () => {
                assert.strictEqual(testRegistry.registeredItems.length, 0)
            })
        })

        // other get cases are tested in the add section
        describe('getRegisteredItem', async () => {
            it('returns undefined if the registry has no registered templates', () => {
                assert.strictEqual(testRegistry.getRegisteredItem('/template.yaml'), undefined)
            })

            it('returns undefined if the registry does not contain the template in question', async () => {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                await testRegistry.addItemToRegistry(vscode.Uri.file(filename.fsPath))

                assert.strictEqual(testRegistry.getRegisteredItem('/not-the-template.yaml'), undefined)
            })
        })

        describe('removeTemplateFromRegistry', async () => {
            it('removes an added template', async () => {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                await testRegistry.addItemToRegistry(vscode.Uri.file(filename.fsPath))
                assert.strictEqual(testRegistry.registeredItems.length, 1)

                testRegistry.remove(vscode.Uri.file(filename.fsPath))
                assert.strictEqual(testRegistry.registeredItems.length, 0)
            })

            it('does not affect the registry if a nonexistant template is removed', async () => {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                await testRegistry.addItemToRegistry(vscode.Uri.file(filename.fsPath))
                assert.strictEqual(testRegistry.registeredItems.length, 1)

                testRegistry.remove(vscode.Uri.file(path.join(tempFolder, 'wrong-template.yaml')))
                assert.strictEqual(testRegistry.registeredItems.length, 1)
            })
        })
    })

    // Consts for the non-class functions
    const rootPath = path.join('i', 'am', 'your', 'father')
    const nestedPath = path.join('s', 'brothers', 'nephews', 'cousins', 'former', 'roommate')
    const otherPath = path.join('obi-wan', 'killed', 'your', 'father')
    const matchingResource: {
        Type: 'AWS::Serverless::Function'
        Properties: CloudFormation.ZipResourceProperties
    } = {
        Type: 'AWS::Serverless::Function',
        Properties: {
            Handler: 'index.handler',
            CodeUri: path.join(nestedPath),
            Runtime: 'nodejs12.x',
        },
    }
    const nonParentTemplate = {
        path: path.join(otherPath, 'template.yaml'),
        item: {},
    }
    const workingTemplate = {
        path: path.join(rootPath, 'template.yaml'),
        item: {
            Resources: {
                resource1: matchingResource,
            },
        },
    }
    const noResourceTemplate = {
        path: path.join(rootPath, 'template.yaml'),
        item: {
            Resources: {},
        },
    }
    const compiledResource: {
        Type: 'AWS::Serverless::Function'
        Properties: CloudFormation.ZipResourceProperties
    } = {
        Type: 'AWS::Serverless::Function',
        Properties: {
            Handler: 'Asdf::Asdf.Function::FunctionHandler',
            CodeUri: path.join(nestedPath),
            Runtime: 'dotnetcore3.1',
        },
    }
    const dotNetTemplate = {
        path: path.join(rootPath, 'template.yaml'),
        item: {
            Resources: {
                resource1: compiledResource,
            },
        },
    }
    const multiResourceTemplate = {
        path: path.join(rootPath, 'template.yaml'),
        item: {
            Resources: {
                resource1: matchingResource,
                resource2: {
                    ...matchingResource,
                    Properties: {
                        ...matchingResource.Properties,
                        Timeout: 5000,
                    },
                },
            },
        },
    }
    const badRuntimeTemplate = {
        path: path.join(rootPath, 'template.yaml'),
        item: {
            Resources: {
                badResource: {
                    ...matchingResource,
                    Properties: {
                        ...matchingResource.Properties,
                        Runtime: 'COBOL-60',
                    },
                },
                goodResource: matchingResource,
            },
        },
    }

    describe('getResourcesForHandler', () => {
        it('handles empty input', () => {
            // Empty `unfilteredTemplates` input:
            assert.deepStrictEqual(
                getResourcesForHandler(path.join(rootPath, nestedPath, 'index.js'), 'handler', []),
                []
            )
        })

        it('returns an array containing resources that contain references to the handler in question', () => {
            const val = getResourcesForHandler(path.join(rootPath, nestedPath, 'index.js'), 'handler', [
                nonParentTemplate,
                workingTemplate,
                noResourceTemplate,
                dotNetTemplate,
                multiResourceTemplate,
                badRuntimeTemplate,
            ])

            assert.deepStrictEqual(val, [
                {
                    name: 'resource1',
                    resourceData: matchingResource,
                    templateDatum: workingTemplate,
                },
                {
                    name: 'resource1',
                    resourceData: matchingResource,
                    templateDatum: multiResourceTemplate,
                },
                {
                    name: 'resource2',
                    resourceData: {
                        ...matchingResource,
                        Properties: {
                            ...matchingResource.Properties,
                            Timeout: 5000,
                        },
                    },
                    templateDatum: multiResourceTemplate,
                },
                {
                    name: 'goodResource',
                    resourceData: matchingResource,
                    templateDatum: badRuntimeTemplate,
                },
            ])
        })
    })

    describe('getResourceAssociatedWithHandlerFromTemplateDatum', () => {
        it('returns an empty array if the given template is not a parent of the handler file in question', () => {
            const val = getResourcesForHandlerFromTemplateDatum(
                path.join(rootPath, 'index.js'),
                'handler',
                nonParentTemplate
            )

            assert.deepStrictEqual(val, [])
        })

        it('returns an empty array if the template has no resources', () => {
            const val = getResourcesForHandlerFromTemplateDatum(
                path.join(rootPath, nestedPath, 'index.js'),
                'handler',
                noResourceTemplate
            )

            assert.deepStrictEqual(val, [])
        })

        it('returns a template resource if it has a matching handler', () => {
            const val = getResourcesForHandlerFromTemplateDatum(
                path.join(rootPath, nestedPath, 'index.js'),
                'handler',
                workingTemplate
            )

            assert.deepStrictEqual(val, [
                {
                    name: 'resource1',
                    resourceData: matchingResource,
                },
            ])
        })

        it('ignores path handling if using a compiled language', () => {
            const val = getResourcesForHandlerFromTemplateDatum(
                path.join(rootPath, nestedPath, 'index.cs'),
                'Asdf::Asdf.Function::FunctionHandler',
                dotNetTemplate
            )

            assert.deepStrictEqual(val, [
                {
                    name: 'resource1',
                    resourceData: compiledResource,
                },
            ])
        })

        it('returns all template resources if it has multiple matching handlers', () => {
            const val = getResourcesForHandlerFromTemplateDatum(
                path.join(rootPath, nestedPath, 'index.js'),
                'handler',
                multiResourceTemplate
            )

            assert.deepStrictEqual(val, [
                {
                    name: 'resource1',
                    resourceData: matchingResource,
                },
                {
                    name: 'resource2',
                    resourceData: {
                        ...matchingResource,
                        Properties: {
                            ...matchingResource.Properties,
                            Timeout: 5000,
                        },
                    },
                },
            ])
        })

        it('does not break if the resource has a non-parseable runtime', () => {
            const val = getResourcesForHandlerFromTemplateDatum(
                path.join(rootPath, nestedPath, 'index.js'),
                'handler',
                badRuntimeTemplate
            )

            assert.deepStrictEqual(val, [
                {
                    name: 'goodResource',
                    resourceData: matchingResource,
                },
            ])
        })
    })
})

function assertValidTestTemplate(data: WatchedItem<CloudFormation.Template> | undefined, filename: string): void {
    assert.ok(data)
    if (data) {
        assertEqualPaths(data.path, filename)
        assert.ok(data.item.Resources?.TestResource)
    }
}
