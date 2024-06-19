/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { mkdir, remove, writeFile } from 'fs-extra'
import * as path from 'path'
import globals from '../../../shared/extensionGlobals'
import * as vscode from 'vscode'
import {
    getExistingConfiguration,
    getTemplatesConfigPath,
    load,
    LoadTemplatesConfigContext,
    TemplatesConfigPopulator,
} from '../../../lambda/config/templates'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { makeSampleSamTemplateYaml } from '../../shared/cloudformation/cloudformationTestUtils'

class MockLoadTemplatesConfigContext {
    public readonly fileExists: (path: string) => Thenable<boolean>
    public readonly readFile: (path: string) => Thenable<string>
    public readonly saveDocumentIfDirty: (editorPath: string) => Thenable<void>

    public constructor({
        fileExists = async _path => true,
        readFile = async _path => '',
        saveDocumentIfDirty = async _path => {},
    }: Partial<LoadTemplatesConfigContext>) {
        this.fileExists = fileExists
        this.readFile = readFile
        this.saveDocumentIfDirty = saveDocumentIfDirty
    }
}

describe('templates', async function () {
    describe('load', async function () {
        it('loads a valid file without parameter overrides', async function () {
            const rawJson = `{
                "templates": {
                    "relative/path/to/template.yaml": {
                    }
                }
            }`

            const context = new MockLoadTemplatesConfigContext({
                readFile: async pathLike => rawJson,
            })

            const config = await load('', context)

            assert.ok(config)
            assert.ok(config.templates)
            assert.strictEqual(Object.getOwnPropertyNames(config.templates).length, 1)

            const template = config.templates['relative/path/to/template.yaml']
            assert.ok(template)
            assert.strictEqual(Object.getOwnPropertyNames(template).length, 0)
        })

        it('loads a valid file with parameter overrides', async function () {
            const rawJson = `{
                "templates": {
                    "relative/path/to/template.yaml": {
                        "parameterOverrides": {
                            "myParam1": "myValue1",
                            "myParam2": "myValue2"
                        }
                    }
                }
            }`

            const context = new MockLoadTemplatesConfigContext({
                readFile: async pathLike => rawJson,
            })

            const config = await load('', context)

            assert.ok(config)
            assert.ok(config.templates)
            assert.strictEqual(Object.getOwnPropertyNames(config.templates).length, 1)

            const template = config.templates['relative/path/to/template.yaml']
            assert.ok(template)
            assert.strictEqual(Object.getOwnPropertyNames(template).length, 1)

            const parameterOverrides = template!.parameterOverrides
            assert.ok(parameterOverrides)
            assert.strictEqual(Object.getOwnPropertyNames(parameterOverrides).length, 2)

            const myParam1 = Object.getOwnPropertyDescriptor(parameterOverrides, 'myParam1')
            const myParam2 = Object.getOwnPropertyDescriptor(parameterOverrides, 'myParam2')
            assert.ok(myParam1)
            assert.ok(myParam2)
            assert.strictEqual(myParam1!.value, 'myValue1')
            assert.strictEqual(myParam2!.value, 'myValue2')
        })

        it('returns minimal config on missing file', async function () {
            const context = new MockLoadTemplatesConfigContext({
                fileExists: async pathLike => false,
            })

            const config = await load('', context)

            assert.ok(config)
            assert.ok(config.templates)
            assert.strictEqual(Object.getOwnPropertyNames(config.templates).length, 0)
        })

        it('throws on error loading file', async function () {
            const context = new MockLoadTemplatesConfigContext({
                readFile: async pathLike => {
                    throw new Error('oh no')
                },
            })

            try {
                await load('', context)
            } catch (err) {
                assert.ok(err)
                assert.strictEqual(String(err), 'Error: Could not load .aws/templates.json: Error: oh no')

                return
            }

            assert.fail()
        })

        it('gracefully handles invalid JSON', async function () {
            const context = new MockLoadTemplatesConfigContext({
                readFile: async pathLike => '{',
            })

            try {
                await load('', context)
            } catch (err) {
                assert.ok(err)
                assert.strictEqual(
                    String(err),
                    'Error: Could not load .aws/templates.json: Error: Could not parse .aws/templates.json: close brace expected at offset 1, length 0'
                )

                return
            }

            assert.fail()
        })

        it('supports JSON comments', async function () {
            const rawJson = `{
                "templates": {
                    // A single-comment.
                    /*
                      A multi-line comment.
                    */
                    "relative/path/to/template.yaml": {
                    }
                }
            }`

            const context = new MockLoadTemplatesConfigContext({
                readFile: async pathLike => rawJson,
            })

            const config = await load('', context)

            assert.ok(config)
            assert.ok(config.templates)
            assert.strictEqual(Object.getOwnPropertyNames(config.templates).length, 1)

            const template = config.templates['relative/path/to/template.yaml']
            assert.ok(template)
            assert.strictEqual(Object.getOwnPropertyNames(template).length, 0)
        })

        it('reads the correct path', async function () {
            const readArgs: string[] = []
            const context = new MockLoadTemplatesConfigContext({
                readFile: async pathLike => {
                    readArgs.push(pathLike)

                    return '{}'
                },
            })

            await load(path.join('my', 'path'), context)

            assert.strictEqual(readArgs.length, 1)
            assert.strictEqual(readArgs[0], path.join('my', 'path', '.aws', 'templates.json'))
        })

        it('saves dirty documents before loading', async function () {
            const saveArgs: string[] = []
            let read: boolean = false
            let readBeforeSave: boolean = false
            const context = new MockLoadTemplatesConfigContext({
                readFile: async pathLike => {
                    read = true

                    return '{}'
                },
                saveDocumentIfDirty: async pathLike => {
                    saveArgs.push(pathLike)

                    if (read) {
                        // If we throw here, the exception will be swallowed by `load`'s error handling.
                        readBeforeSave = true
                    }
                },
            })

            await load(path.join('my', 'path'), context)

            assert.strictEqual(readBeforeSave, false)
            assert.strictEqual(saveArgs.length, 1)
            assert.strictEqual(saveArgs[0], path.join('my', 'path', '.aws', 'templates.json'))
        })
    })
})

describe('getTemplatesConfigPath', async function () {
    it('returns expected path', async function () {
        const configPath = getTemplatesConfigPath(path.join('my', 'workspace'))

        assert.strictEqual(configPath, path.join('my', 'workspace', '.aws', 'templates.json'))
    })
})

describe('TemplatesConfigPopulator', async function () {
    const testModificationOptions = {
        formattingOptions: {
            tabSize: 4,
            insertSpaces: true,
        },
    }

    it('handles ModificationOptions', async function () {
        const inputJson: string = '{}'

        const expectedJson: string = String.raw`{
        "templates": {
                "someprocessor": {}
        }
}`

        const results = new TemplatesConfigPopulator(inputJson, {
            formattingOptions: {
                tabSize: 8,
                insertSpaces: true,
            },
        })
            .ensureTemplateSectionExists('someprocessor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(JSON.stringify(results.json), JSON.stringify(expectedJson))
    })

    describe('ensureTemplateSectionExists', async function () {
        it('handles clean data', async function () {
            const inputJson: string = String.raw`{
    "templates": {
        "someprocessor": {}
    }
}`

            const results = new TemplatesConfigPopulator(inputJson, testModificationOptions)
                .ensureTemplateSectionExists('someprocessor')
                .getResults()

            assert.strictEqual(results.isDirty, false, 'Expected results to be clean')
            assert.strictEqual(JSON.stringify(results.json), JSON.stringify(inputJson))
        })

        it('handles missing templates section', async function () {
            const inputJson: string = '{}'

            const expectedJson: string = String.raw`{
    "templates": {
        "someprocessor": {}
    }
}`

            const results = new TemplatesConfigPopulator(inputJson, testModificationOptions)
                .ensureTemplateSectionExists('someprocessor')
                .getResults()

            assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
            assert.strictEqual(JSON.stringify(results.json), JSON.stringify(expectedJson))
        })

        it('handles missing template section', async function () {
            const inputJson: string = String.raw`{
    "templates": {}
}`

            const expectedJson: string = String.raw`{
    "templates": {
        "someprocessor": {}
    }
}`

            const results = new TemplatesConfigPopulator(inputJson, testModificationOptions)
                .ensureTemplateSectionExists('someprocessor')
                .getResults()

            assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
            assert.strictEqual(JSON.stringify(results.json), JSON.stringify(expectedJson))
        })

        it('errs with invalid templates type', async function () {
            const inputJson: string = `{
            "templates": 1234
        }`

            assert.throws(
                () =>
                    new TemplatesConfigPopulator(inputJson, testModificationOptions).ensureTemplateSectionExists(
                        'someprocessor'
                    ),
                {
                    message: 'Invalid configuration',
                    jsonPath: ['templates'],
                    expectedTypes: ['object', 'null'],
                    actualType: 'number',
                }
            )
        })
    })

    describe('ensureTemplateHandlerSectionExists', async function () {
        it('handles clean data', async function () {
            const inputJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "handlers": {
                "processor": {
                    "event": {},
                    "environmentVariables": {},
                }
            }
        }
    }
}`

            const results = new TemplatesConfigPopulator(inputJson, testModificationOptions)
                .ensureTemplateHandlerSectionExists('someprocessor', 'processor')
                .getResults()

            assert.strictEqual(results.isDirty, false, 'Expected results to be clean')
            assert.strictEqual(JSON.stringify(results.json), JSON.stringify(inputJson))
        })

        it('errs with invalid template type', async function () {
            const inputJson: string = String.raw`{
            "templates": {
                "someprocessor": true
            }
        }`

            assert.throws(
                () =>
                    new TemplatesConfigPopulator(inputJson, testModificationOptions).ensureTemplateHandlerSectionExists(
                        'someprocessor',
                        'processor'
                    ),
                {
                    message: 'Invalid configuration',
                    jsonPath: ['templates', 'someprocessor'],
                    expectedTypes: ['object', 'null'],
                    actualType: 'boolean',
                }
            )
        })

        it('errs with invalid handlers type', async function () {
            const inputJson: string = String.raw`{
            "templates": {
                "someprocessor": {
                    "handlers": [1, 2, 3]
                }
        }`

            assert.throws(
                () =>
                    new TemplatesConfigPopulator(inputJson, testModificationOptions).ensureTemplateHandlerSectionExists(
                        'someprocessor',
                        'processor'
                    ),
                {
                    message: 'Invalid configuration',
                    jsonPath: ['templates', 'someprocessor', 'handlers'],
                    expectedTypes: ['object', 'null'],
                    actualType: 'array',
                }
            )
        })

        it('errs with invalid handler type', async function () {
            const inputJson: string = String.raw`{
            "templates": {
                "someprocessor": {
                    "handlers": {
                        "processor": "hello"
                    }
                }
        }`

            assert.throws(
                () =>
                    new TemplatesConfigPopulator(inputJson, testModificationOptions).ensureTemplateHandlerSectionExists(
                        'someprocessor',
                        'processor'
                    ),
                {
                    message: 'Invalid configuration',
                    jsonPath: ['templates', 'someprocessor', 'handlers', 'processor'],
                    expectedTypes: ['object', 'null'],
                    actualType: 'string',
                }
            )
        })

        it('handles missing handlers section', async function () {
            const inputJson: string = String.raw`{
    "templates": {
        "someprocessor": {
        }
    }
}`

            const expectedJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "handlers": {
                "processor": {
                    "event": {},
                    "environmentVariables": {}
                }
            }
        }
    }
}`

            const results = new TemplatesConfigPopulator(inputJson, testModificationOptions)
                .ensureTemplateHandlerSectionExists('someprocessor', 'processor')
                .getResults()

            assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
            assert.strictEqual(JSON.stringify(results.json), JSON.stringify(expectedJson))
        })

        it('handles missing handler section', async function () {
            const inputJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "handlers": {}
        }
    }
}`

            const expectedJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "handlers": {
                "processor": {
                    "event": {},
                    "environmentVariables": {}
                }
            }
        }
    }
}`

            const results = new TemplatesConfigPopulator(inputJson, testModificationOptions)
                .ensureTemplateHandlerSectionExists('someprocessor', 'processor')
                .getResults()

            assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
            assert.strictEqual(JSON.stringify(results.json), JSON.stringify(expectedJson))
        })
    })

    describe('ensureTemplateHandlerPropertiesExist', async function () {
        it('handles clean data', async function () {
            const inputJson: string = `{
    "templates": {
        "someprocessor": {
            "handlers": {
                "processor": {
                    "event": {},
                    "environmentVariables": {}
                }
            }
        }
    }
}`

            const results = new TemplatesConfigPopulator(inputJson, testModificationOptions)
                .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor')
                .getResults()

            assert.strictEqual(results.isDirty, false, 'Expected results to be clean')
            assert.strictEqual(JSON.stringify(results.json), JSON.stringify(inputJson))
        })

        it('errs with invalid handler type', async function () {
            const inputJson: string = String.raw`{
            "templates": {
                "someprocessor": {
                    "handlers": {
                        "processor": "hello"
                    }
                }
        }`

            assert.throws(
                () =>
                    new TemplatesConfigPopulator(
                        inputJson,
                        testModificationOptions
                    ).ensureTemplateHandlerPropertiesExist('someprocessor', 'processor'),
                {
                    message: 'Invalid configuration',
                    jsonPath: ['templates', 'someprocessor', 'handlers', 'processor'],
                    expectedTypes: ['object', 'null'],
                    actualType: 'string',
                }
            )
        })

        it('errs with invalid event type', async function () {
            const inputJson: string = String.raw`{
            "templates": {
                "someprocessor": {
                    "handlers": {
                        "processor": {
                            "event": 1
                        }
                    }
                }
        }`

            assert.throws(
                () =>
                    new TemplatesConfigPopulator(
                        inputJson,
                        testModificationOptions
                    ).ensureTemplateHandlerPropertiesExist('someprocessor', 'processor'),
                {
                    message: 'Invalid configuration',
                    jsonPath: ['templates', 'someprocessor', 'handlers', 'processor', 'event'],
                    expectedTypes: ['object', 'null'],
                    actualType: 'number',
                }
            )
        })

        it('handles missing everything', async function () {
            const inputJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "handlers": {
                "processor": {
                }
            }
        }
    }
}`

            const expectedJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "handlers": {
                "processor": {
                    "event": {},
                    "environmentVariables": {}
                }
            }
        }
    }
}`

            const results = new TemplatesConfigPopulator(inputJson, testModificationOptions)
                .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor')
                .getResults()

            assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
            assert.strictEqual(JSON.stringify(results.json), JSON.stringify(expectedJson))
        })

        it('handles missing event', async function () {
            const inputJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "handlers": {
                "processor": {
                    "environmentVariables": {}
                }
            }
        }
    }
}`

            const expectedJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "handlers": {
                "processor": {
                    "environmentVariables": {},
                    "event": {}
                }
            }
        }
    }
}`

            const results = new TemplatesConfigPopulator(inputJson, testModificationOptions)
                .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor')
                .getResults()

            assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
            assert.strictEqual(JSON.stringify(results.json), JSON.stringify(expectedJson))
        })

        it('handles missing envvars', async function () {
            const inputJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "handlers": {
                "processor": {
                    "event": {}
                }
            }
        }
    }
}`

            const expectedJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "handlers": {
                "processor": {
                    "event": {},
                    "environmentVariables": {}
                }
            }
        }
    }
}`

            const results = new TemplatesConfigPopulator(inputJson, testModificationOptions)
                .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor')
                .getResults()

            assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
            assert.strictEqual(JSON.stringify(results.json), JSON.stringify(expectedJson))
        })
    })

    describe('ensureTemplateParameterOverrideExists', async function () {
        it('creates parameterOverrides section if it does not already exist', async function () {
            const inputJson: string = String.raw`{
    "templates": {
        "someprocessor": {
        }
    }
}`

            const expectedJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "parameterOverrides": {
                "myParam": ""
            }
        }
    }
}`
            const { isDirty, json } = new TemplatesConfigPopulator(inputJson, testModificationOptions)
                .ensureTemplateParameterOverrideExists('someprocessor', 'myParam')
                .getResults()

            assert.strictEqual(JSON.stringify(json), JSON.stringify(expectedJson))
            assert.strictEqual(isDirty, true, 'Expected results to be dirty')
        })

        it('adds new override if it does not already exist', async function () {
            const inputJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "parameterOverrides": {
            }
        }
    }
}`

            const expectedJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "parameterOverrides": {
                "myParam": ""
            }
        }
    }
}`
            const { isDirty, json } = new TemplatesConfigPopulator(inputJson, testModificationOptions)
                .ensureTemplateParameterOverrideExists('someprocessor', 'myParam')
                .getResults()

            assert.strictEqual(JSON.stringify(json), JSON.stringify(expectedJson))
            assert.strictEqual(isDirty, true, 'Expected results to be dirty')
        })

        it('does not overwrite existing overrides', async function () {
            const inputJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "parameterOverrides": {
                "myParam": "myValue"
            }
        }
    }
}`

            const { isDirty, json } = new TemplatesConfigPopulator(inputJson, testModificationOptions)
                .ensureTemplateParameterOverrideExists('someprocessor', 'myParam')
                .getResults()

            assert.strictEqual(JSON.stringify(json), JSON.stringify(inputJson))
            assert.strictEqual(isDirty, false, 'Expected results to be clean')
        })

        it('throws if parameterOverrides exists, but is not an object or null', async function () {
            const inputJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "parameterOverrides": "hello"
        }
    }
}`

            const populator = new TemplatesConfigPopulator(inputJson, testModificationOptions)
            assert.throws(() => populator.ensureTemplateParameterOverrideExists('someprocessor', 'myParam'))
        })

        it('throws if override value exists, but is not a string or null', async function () {
            const inputJson: string = String.raw`{
    "templates": {
        "someprocessor": {
            "parameterOverrides": {
                "myParam": {}
            }
        }
    }
}`

            const populator = new TemplatesConfigPopulator(inputJson, testModificationOptions)
            assert.throws(() => populator.ensureTemplateParameterOverrideExists('someprocessor', 'myParam'))
        })
    })
})

describe('getExistingConfiguration', async function () {
    let tempFolder: string
    let tempTemplateFile: vscode.Uri
    let tempConfigFile: string
    let fakeWorkspaceFolder: vscode.WorkspaceFolder
    let tempConfigFolder: string
    const matchedHandler = "it'sTheSameHandler"

    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        tempTemplateFile = vscode.Uri.file(path.join(tempFolder, 'test.yaml'))
        fakeWorkspaceFolder = {
            uri: vscode.Uri.file(tempFolder),
            name: 'workspaceFolderMimic',
            index: 0,
        }
        tempConfigFolder = path.join(tempFolder, '.aws')
        await mkdir(tempConfigFolder)
        tempConfigFile = path.join(tempConfigFolder, 'templates.json')
    })

    afterEach(async function () {
        await remove(tempFolder)
        const r = await globals.templateRegistry
        r.reset()
    })

    it("returns undefined if the legacy config file doesn't exist", async () => {
        const val = await getExistingConfiguration(fakeWorkspaceFolder, 'handlerDoesNotMatter', tempTemplateFile)
        assert.strictEqual(val, undefined)
    })

    it('returns undefined if the legacy config file is not valid JSON', async function () {
        await writeFile(tempTemplateFile.fsPath, makeSampleSamTemplateYaml(true, { handler: matchedHandler }), 'utf8')
        await writeFile(tempConfigFile, makeSampleSamTemplateYaml(true, { handler: matchedHandler }), 'utf8')
        await (await globals.templateRegistry).addItem(tempTemplateFile)
        const val = await getExistingConfiguration(fakeWorkspaceFolder, matchedHandler, tempTemplateFile)
        assert.strictEqual(val, undefined)
    })

    it('returns data from the legacy config file', async function () {
        await writeFile(tempTemplateFile.fsPath, makeSampleSamTemplateYaml(true, { handler: matchedHandler }), 'utf8')
        const configData = {
            templates: {
                'test.yaml': {
                    handlers: {
                        [matchedHandler]: {
                            event: { asdf: 'asdf' },
                            environmentVariables: {},
                            useContainer: false,
                        },
                    },
                },
            },
        }
        await writeFile(tempConfigFile, JSON.stringify(configData), 'utf8')
        await (await globals.templateRegistry).addItem(tempTemplateFile)
        const val = await getExistingConfiguration(fakeWorkspaceFolder, matchedHandler, tempTemplateFile)
        assert.ok(val)
        if (val) {
            assert.deepStrictEqual(val.environmentVariables, {})
            assert.deepStrictEqual(val.eventJson, { asdf: 'asdf' })
            assert.strictEqual(val.dockerNetwork, undefined)
            assert.strictEqual(val.useContainer, false)
        }
    })
})
