/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'

import {
    CloudFormationTemplateRegistry,
    getResourcesForHandler,
    getResourcesForHandlerFromTemplateDatum,
} from '../../../shared/fs/templateRegistry'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { badYaml, makeSampleSamTemplateYaml, strToYamlFile } from '../cloudformation/cloudformationTestUtils'
import { assertEqualPaths, toFile } from '../../testUtil'
import * as CloudFormation from '../../../shared/cloudformation/cloudformation'
import { WatchedItem } from '../../../shared/fs/watchedFiles'

// TODO almost all of these tests should be moved to test WatchedFiles instead
describe('CloudFormation Template Registry', async function () {
    const goodYaml1 = makeSampleSamTemplateYaml(false)

    describe('CloudFormationTemplateRegistry', async function () {
        let testRegistry: CloudFormationTemplateRegistry
        let tempFolder: string

        beforeEach(async function () {
            tempFolder = await makeTemporaryToolkitFolder()
            testRegistry = new CloudFormationTemplateRegistry()
        })

        afterEach(async function () {
            await fs.remove(tempFolder)
        })

        describe('addItem', async function () {
            it("adds data from a template to the registry and can receive the template's data", async () => {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                await testRegistry.addItem(filename)

                assert.strictEqual(testRegistry.items.length, 1)

                const data = testRegistry.getItem(filename.fsPath)

                assertValidTestTemplate(data, filename.fsPath)
            })

            it('throws an error if the file to add is not a CF template', async function () {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(badYaml, filename.fsPath)

                assert.strictEqual(await testRegistry.addItem(vscode.Uri.file(filename.fsPath)), undefined)
            })
        })

        // other get cases are tested in the add section
        describe('items', async function () {
            it('returns an empty array if the registry has no registered templates', function () {
                assert.strictEqual(testRegistry.items.length, 0)
            })
        })

        // other get cases are tested in the add section
        describe('getRegisteredItem', async function () {
            it('Returns the item from the VSCode URI', async function () {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                await testRegistry.addItem(filename)

                const data = testRegistry.getItem(filename)

                assertValidTestTemplate(data, filename.fsPath)
            })

            it('returns undefined if the registry has no registered templates', function () {
                assert.strictEqual(testRegistry.getItem('/template.yaml'), undefined)
            })

            it('returns undefined if the registry does not contain the template in question', async function () {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                await testRegistry.addItem(vscode.Uri.file(filename.fsPath))

                assert.strictEqual(testRegistry.getItem('/not-the-template.yaml'), undefined)
            })
        })

        describe('removeTemplateFromRegistry', async function () {
            it('removes an added template', async function () {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                await testRegistry.addItem(vscode.Uri.file(filename.fsPath))
                assert.strictEqual(testRegistry.items.length, 1)

                await testRegistry.remove(filename)
                assert.strictEqual(testRegistry.items.length, 0)
            })

            it('does not affect the registry if a nonexistant template is removed', async function () {
                const filename = vscode.Uri.file(path.join(tempFolder, 'template.yaml'))
                await strToYamlFile(goodYaml1, filename.fsPath)
                await testRegistry.addItem(vscode.Uri.file(filename.fsPath))
                assert.strictEqual(testRegistry.items.length, 1)

                await testRegistry.remove(vscode.Uri.file(path.join(tempFolder, 'wrong-template.yaml')))
                assert.strictEqual(testRegistry.items.length, 1)
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
            Runtime: 'nodejs16.x',
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
            Runtime: 'dotnet6',
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

    describe('getResourcesForHandler', function () {
        it('handles empty input', function () {
            // Empty `unfilteredTemplates` input:
            assert.deepStrictEqual(
                getResourcesForHandler(path.join(rootPath, nestedPath, 'index.js'), 'handler', []),
                []
            )
        })

        it('returns an array containing resources that contain references to the handler in question', function () {
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

    describe('getResourcesForHandlerFromTemplateDatum', function () {
        it('returns an empty array if the given template is not a parent of the handler file in question', function () {
            const val = getResourcesForHandlerFromTemplateDatum(
                path.join(rootPath, 'index.js'),
                'handler',
                nonParentTemplate
            )

            assert.deepStrictEqual(val, [])
        })

        it('returns an empty array if the template has no resources', function () {
            const val = getResourcesForHandlerFromTemplateDatum(
                path.join(rootPath, nestedPath, 'index.js'),
                'handler',
                noResourceTemplate
            )

            assert.deepStrictEqual(val, [])
        })

        it('returns a template resource if it has a matching handler', function () {
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

        it('ignores path handling if using a compiled language', function () {
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

        it('returns all template resources if it has multiple matching handlers', function () {
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

        it('does not break if the resource has a non-parseable runtime', function () {
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

    describe('getResourcesForHandlerFromTemplateDatum (image tests)', async function () {
        let tempFolder: string
        let helloPath: string
        let nestedPath: string

        beforeEach(async function () {
            tempFolder = await makeTemporaryToolkitFolder()
            helloPath = path.join(tempFolder, 'hello-world')
            nestedPath = path.join(helloPath, 'nested')
        })

        afterEach(async function () {
            await fs.remove(tempFolder)
        })

        const resource: {
            Type: 'AWS::Serverless::Function'
            Properties: CloudFormation.ImageResourceProperties
        } = {
            Type: 'AWS::Serverless::Function',
            Properties: {
                PackageType: 'Image',
                Events: {
                    HelloWorld: {
                        Type: 'Api',
                        Properties: {
                            Path: '/hello',
                            Method: 'get',
                        },
                    },
                },
            },
        }

        it('checks for an exact handler match to a relative path in a Dockerfile for image functions', async function () {
            await toFile('CMD: ["index.handler"]', path.join(helloPath, 'Dockerfile'))
            await toFile('CMD: ["index.handler"]', path.join(nestedPath, 'Dockerfile'))

            const helloWorldResource = {
                ...resource,
                ...{
                    Metadata: {
                        DockerTag: 'nodejs16.x-v1',
                        DockerContext: './hello-world',
                        Dockerfile: 'Dockerfile',
                    },
                },
            }

            const helloWorldNestedResource = {
                ...resource,
                ...{
                    Metadata: {
                        DockerTag: 'nodejs16.x-v1',
                        DockerContext: './hello-world/nested',
                        Dockerfile: 'Dockerfile',
                    },
                },
            }

            const template = {
                path: path.join(tempFolder, 'template.yaml'),
                item: {
                    Resources: {
                        helloWorldResource,
                        helloWorldNestedResource,
                    },
                },
            }
            const val = getResourcesForHandlerFromTemplateDatum(
                path.join(helloPath, 'index.js'),
                'index.handler',
                template
            )

            assert.deepStrictEqual(
                val,
                [
                    {
                        name: 'helloWorldResource',
                        resourceData: helloWorldResource,
                    },
                ],
                'non-nested case failed'
            )

            const val2 = getResourcesForHandlerFromTemplateDatum(
                path.join(nestedPath, 'index.js'),
                'index.handler',
                template
            )

            assert.deepStrictEqual(
                val2,
                [
                    {
                        name: 'helloWorldNestedResource',
                        resourceData: helloWorldNestedResource,
                    },
                ],
                'nested case failed'
            )
        })

        it('checks for an exact handler match for C# files in a Dockerfile for image functions', async function () {
            await toFile(
                'CMD: ["HelloWorld::HelloWorld.Function::FunctionHandler"]',
                path.join(helloPath, 'Dockerfile')
            )
            await toFile(
                'CMD: ["HelloWorld::HelloWorld.Function::FunctionHandler"]',
                path.join(nestedPath, 'Dockerfile')
            )

            const helloWorldResource = {
                ...resource,
                ...{
                    Metadata: {
                        DockerTag: 'dotnetcore3.1-v1',
                        DockerContext: './hello-world',
                        Dockerfile: 'Dockerfile',
                        DockerBuildArgs: {
                            SAM_BUILD_MODE: 'run',
                        },
                    },
                },
            }

            const helloWorldNestedResource = {
                ...resource,
                ...{
                    Metadata: {
                        DockerTag: 'dotnetcore3.1-v1',
                        DockerContext: './hello-world/nested',
                        Dockerfile: 'Dockerfile',
                        DockerBuildArgs: {
                            SAM_BUILD_MODE: 'run',
                        },
                    },
                },
            }

            const template = {
                path: path.join(tempFolder, 'template.yaml'),
                item: {
                    Resources: {
                        helloWorldResource,
                        helloWorldNestedResource,
                    },
                },
            }
            const val = getResourcesForHandlerFromTemplateDatum(
                path.join(helloPath, 'HelloWorld.cs'),
                'HelloWorld::HelloWorld.Function::FunctionHandler',
                template
            )

            assert.deepStrictEqual(
                val,
                [
                    {
                        name: 'helloWorldResource',
                        resourceData: helloWorldResource,
                    },
                ],
                'non-nested case failed'
            )

            const val2 = getResourcesForHandlerFromTemplateDatum(
                path.join(nestedPath, 'HelloWorld.cs'),
                'HelloWorld::HelloWorld.Function::FunctionHandler',
                template
            )

            // checks all Dockerfiles in parent paths
            assert.deepStrictEqual(
                val2,
                [
                    {
                        name: 'helloWorldResource',
                        resourceData: helloWorldResource,
                    },
                    {
                        name: 'helloWorldNestedResource',
                        resourceData: helloWorldNestedResource,
                    },
                ],
                'nested case failed'
            )
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
