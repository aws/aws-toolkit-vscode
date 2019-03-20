/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as path from 'path'
import {
    getTemplateRelativePath,
    getTemplatesConfigPath,
    HandlerConfig,
    load,
    LoadTemplatesConfigContext,
    TemplatesConfig,
    TemplatesConfigPopulator
} from '../../../lambda/config/templates'

class MockLoadTemplatesConfigContext {
    public readonly fileExists: (path: string) => Thenable<boolean>
    public readonly readFile: (path: string) => Thenable<string>
    public readonly saveDocumentIfDirty: (editorPath: string) => Thenable<void>

    public constructor({
        fileExists = async _path => true,
        readFile = async _path => '',
        saveDocumentIfDirty = async _path => { }
    }: Partial<LoadTemplatesConfigContext>) {
        this.fileExists = fileExists
        this.readFile = readFile
        this.saveDocumentIfDirty = saveDocumentIfDirty
    }
}

describe('templates', async () => {
    describe('load', async () => {
        it('loads a valid file without parameter overrides', async () => {
            const rawJson = `{
                "templates": {
                    "relative/path/to/template.yaml": {
                    }
                }
            }`

            const context = new MockLoadTemplatesConfigContext({
                readFile: async pathLike => rawJson
            })

            const config = await load('', context)

            assert.ok(config)
            assert.ok(config.templates)
            assert.strictEqual(Object.getOwnPropertyNames(config.templates).length, 1)

            const template = config.templates['relative/path/to/template.yaml']
            assert.ok(template)
            assert.strictEqual(Object.getOwnPropertyNames(template).length, 0)
        })

        it('loads a valid file with parameter overrides', async () => {
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
                readFile: async pathLike => rawJson
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

        it('returns minimal config on missing file', async () => {
            const context = new MockLoadTemplatesConfigContext({
                fileExists: async pathLike => false
            })

            const config = await load('', context)

            assert.ok(config)
            assert.ok(config.templates)
            assert.strictEqual(Object.getOwnPropertyNames(config.templates).length, 0)
        })

        it('throws on error loading file', async () => {
            const context = new MockLoadTemplatesConfigContext({
                readFile: async pathLike => { throw new Error('oh no') },
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

        it('gracefully handles invalid JSON', async () => {
            const context = new MockLoadTemplatesConfigContext({
                readFile: async pathLike => '{',
            })

            try {
                await load('', context)
            } catch (err) {
                assert.ok(err)
                assert.strictEqual(
                    String(err),
                    // tslint:disable-next-line:max-line-length
                    'Error: Could not load .aws/templates.json: Error: Could not parse .aws/templates.json: close brace expected at offset 1, length 0'
                )

                return
            }

            assert.fail()
        })

        it('supports JSON comments', async () => {
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

        it('reads the correct path', async () => {
            const readArgs: string[] = []
            const context = new MockLoadTemplatesConfigContext({
                readFile: async pathLike => {
                    readArgs.push(pathLike)

                    return '{}'
                },
            })

            await load(
                path.join('my', 'path'),
                context
            )

            assert.strictEqual(readArgs.length, 1)
            assert.strictEqual(readArgs[0], path.join('my', 'path', '.aws', 'templates.json'))
        })

        it('saves dirty documents before loading', async () => {
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
                }
            })

            await load(
                path.join('my', 'path'),
                context
            )

            assert.strictEqual(readBeforeSave, false)
            assert.strictEqual(saveArgs.length, 1)
            assert.strictEqual(saveArgs[0], path.join('my', 'path', '.aws', 'templates.json'))
        })
    })
})

describe('getTemplatesConfigPath', async () => {
    it('returns expected path', async () => {
        const configPath = getTemplatesConfigPath(path.join('my', 'workspace'))

        assert.strictEqual(configPath, path.join('my', 'workspace', '.aws', 'templates.json'))
    })
})

describe('getTemplateRelativePath', async () => {
    it('returns expected path', async () => {
        const workspaceFolderPath = path.join('my', 'workspace')
        const expectedRelativePath = path.join('processors', 'template.yaml')
        const templatePath = path.join(workspaceFolderPath, expectedRelativePath)

        const relativePath = getTemplateRelativePath(templatePath, workspaceFolderPath)

        assert.strictEqual(relativePath, expectedRelativePath.replace(path.sep, path.posix.sep))
    })
})

describe('TemplatesConfigPopulatorContext', async () => {
    it('ensureTemplateSectionExists handles clean data', async () => {
        const inputData: TemplatesConfig = {
            templates: {
                someprocessor: {}
            }
        }

        const results = new TemplatesConfigPopulator(inputData)
            .ensureTemplateSectionExists('someprocessor')
            .getResults()

        assert.strictEqual(results.isDirty, false, 'Expected results to be clean')
        assert.strictEqual(
            JSON.stringify(results.templatesConfig),
            JSON.stringify(inputData)
        )
    })

    it('ensureTemplateSectionExists handles missing templates section', async () => {
        const inputData: TemplatesConfig = {
        } as any as TemplatesConfig

        const expectedData: TemplatesConfig = {
            templates: {
                someprocessor: {}
            }
        }

        const results = new TemplatesConfigPopulator(inputData)
            .ensureTemplateSectionExists('someprocessor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.templatesConfig),
            JSON.stringify(expectedData)
        )
    })

    it('ensureTemplateSectionExists handles missing template section', async () => {
        const inputData: TemplatesConfig = {
            templates: {}
        }

        const expectedData: TemplatesConfig = {
            templates: {
                someprocessor: {}
            }
        }

        const results = new TemplatesConfigPopulator(inputData)
            .ensureTemplateSectionExists('someprocessor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.templatesConfig),
            JSON.stringify(expectedData)
        )
    })

    it('ensureTemplateHandlerSectionExists handles clean data', async () => {
        const inputData: TemplatesConfig = {
            templates: {
                someprocessor: {
                    handlers: {
                        processor: {
                            event: {},
                            environmentVariables: {},
                        }
                    }
                }
            }
        }

        const results = new TemplatesConfigPopulator(inputData)
            .ensureTemplateHandlerSectionExists('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, false, 'Expected results to be clean')
        assert.strictEqual(
            JSON.stringify(results.templatesConfig),
            JSON.stringify(inputData)
        )
    })

    it('ensureTemplateHandlerSectionExists handles missing handlers section', async () => {
        const inputData: TemplatesConfig = {
            templates: {
                someprocessor: {
                }
            }
        }

        const expectedData: TemplatesConfig = {
            templates: {
                someprocessor: {
                    handlers: {
                        processor: {
                            event: {},
                            environmentVariables: {},
                        }
                    }
                }
            }
        }

        const results = new TemplatesConfigPopulator(inputData)
            .ensureTemplateHandlerSectionExists('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.templatesConfig),
            JSON.stringify(expectedData)
        )
    })

    it('ensureTemplateHandlerSectionExists handles missing handler section', async () => {
        const inputData: TemplatesConfig = {
            templates: {
                someprocessor: {
                    handlers: {}
                }
            }
        }

        const expectedData: TemplatesConfig = {
            templates: {
                someprocessor: {
                    handlers: {
                        processor: {
                            event: {},
                            environmentVariables: {},
                        }
                    }
                }
            }
        }

        const results = new TemplatesConfigPopulator(inputData)
            .ensureTemplateHandlerSectionExists('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.templatesConfig),
            JSON.stringify(expectedData)
        )
    })

    it('ensureTemplateHandlerPropertiesExist handles clean data', async () => {
        const inputData: TemplatesConfig = {
            templates: {
                someprocessor: {
                    handlers: {
                        processor: {
                            event: {},
                            environmentVariables: {},
                        }
                    }
                }
            }
        }

        const results = new TemplatesConfigPopulator(inputData)
            .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, false, 'Expected results to be clean')
        assert.strictEqual(
            JSON.stringify(results.templatesConfig),
            JSON.stringify(inputData)
        )
    })

    it('ensureTemplateHandlerPropertiesExist handles missing everything', async () => {
        const inputData: TemplatesConfig = {
            templates: {
                someprocessor: {
                    handlers: {
                        processor: {
                        } as any as HandlerConfig
                    }
                }
            }
        }

        const expectedData: TemplatesConfig = {
            templates: {
                someprocessor: {
                    handlers: {
                        processor: {
                            event: {},
                            environmentVariables: {},
                        }
                    }
                }
            }
        }

        const results = new TemplatesConfigPopulator(inputData)
            .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.templatesConfig),
            JSON.stringify(expectedData)
        )
    })

    it('ensureTemplateHandlerPropertiesExist handles missing event', async () => {
        const inputData: TemplatesConfig = {
            templates: {
                someprocessor: {
                    handlers: {
                        processor: {
                            environmentVariables: {}
                        } as any as HandlerConfig
                    }
                }
            }
        }

        const expectedData: TemplatesConfig = {
            templates: {
                someprocessor: {
                    handlers: {
                        processor: {
                            environmentVariables: {},
                            event: {},
                        }
                    }
                }
            }
        }

        const results = new TemplatesConfigPopulator(inputData)
            .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.templatesConfig),
            JSON.stringify(expectedData)
        )
    })

    it('ensureTemplateHandlerPropertiesExist handles missing envvars', async () => {
        const inputData: TemplatesConfig = {
            templates: {
                someprocessor: {
                    handlers: {
                        processor: {
                            event: {}
                        } as any as HandlerConfig
                    }
                }
            }
        }

        const expectedData: TemplatesConfig = {
            templates: {
                someprocessor: {
                    handlers: {
                        processor: {
                            event: {},
                            environmentVariables: {},
                        }
                    }
                }
            }
        }

        const results = new TemplatesConfigPopulator(inputData)
            .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.templatesConfig),
            JSON.stringify(expectedData)
        )
    })
})
