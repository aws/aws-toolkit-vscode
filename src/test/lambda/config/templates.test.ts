/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as path from 'path'
import {
    getTemplatesConfigPath,
    load,
    LoadTemplatesConfigContext,
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

describe('TemplatesConfigPopulatorContext', async () => {

    it('handles ModificationOptions', async () => {
        const inputJson: string = '{}'

        const expectedJson: string = String.raw`{
        "templates": {
                "someprocessor": {}
        }
}`

        const results = new TemplatesConfigPopulator(
            inputJson,
            {
                formattingOptions: {
                    tabSize: 8,
                    insertSpaces: true,
                }
            }
        )
            .ensureTemplateSectionExists('someprocessor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.json),
            JSON.stringify(expectedJson)
        )
    })

    it('ensureTemplateSectionExists handles clean data', async () => {
        const inputJson: string = String.raw`{
    "templates": {
        "someprocessor": {}
    }
}`

        const results = new TemplatesConfigPopulator(inputJson)
            .ensureTemplateSectionExists('someprocessor')
            .getResults()

        assert.strictEqual(results.isDirty, false, 'Expected results to be clean')
        assert.strictEqual(
            JSON.stringify(results.json),
            JSON.stringify(inputJson)
        )
    })

    it('ensureTemplateSectionExists handles missing templates section', async () => {
        const inputJson: string = '{}'

        const expectedJson: string = String.raw`{
    "templates": {
        "someprocessor": {}
    }
}`

        const results = new TemplatesConfigPopulator(inputJson)
            .ensureTemplateSectionExists('someprocessor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.json),
            JSON.stringify(expectedJson)
        )
    })

    it('ensureTemplateSectionExists handles missing template section', async () => {
        const inputJson: string = String.raw`{
    "templates": {}
}`

        const expectedJson: string = String.raw`{
    "templates": {
        "someprocessor": {}
    }
}`

        const results = new TemplatesConfigPopulator(inputJson)
            .ensureTemplateSectionExists('someprocessor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.json),
            JSON.stringify(expectedJson)
        )
    })

    it('ensureTemplateSectionExists errs with invalid templates type', async () => {
        const inputJson: string = `{
            "templates": 1234
        }`

        assert.throws(
            () => new TemplatesConfigPopulator(inputJson)
                .ensureTemplateSectionExists('someprocessor'),
            /Invalid configuration. Field templates was expected to be an object, but was number instead/
        )
    })

    it('ensureTemplateHandlerSectionExists handles clean data', async () => {
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

        const results = new TemplatesConfigPopulator(inputJson)
            .ensureTemplateHandlerSectionExists('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, false, 'Expected results to be clean')
        assert.strictEqual(
            JSON.stringify(results.json),
            JSON.stringify(inputJson)
        )
    })

    it('ensureTemplateHandlerSectionExists errs with invalid template type', async () => {
        const inputJson: string = String.raw`{
            "templates": {
                "someprocessor": true
            }
        }`

        assert.throws(
            () => new TemplatesConfigPopulator(inputJson)
                .ensureTemplateHandlerSectionExists('someprocessor', 'processor'),
            // tslint:disable-next-line:max-line-length
            /Invalid configuration. Field templates\/someprocessor was expected to be an object, but was boolean instead/
        )
    })

    it('ensureTemplateHandlerSectionExists errs with invalid handlers type', async () => {
        const inputJson: string = String.raw`{
            "templates": {
                "someprocessor": {
                    "handlers": [1, 2, 3]
                }
        }`

        assert.throws(
            () => new TemplatesConfigPopulator(inputJson)
                .ensureTemplateHandlerSectionExists('someprocessor', 'processor'),
            // tslint:disable-next-line:max-line-length
            /Invalid configuration. Field templates\/someprocessor\/handlers was expected to be an object, but was array instead/
        )
    })

    it('ensureTemplateHandlerSectionExists errs with invalid handler type', async () => {
        const inputJson: string = String.raw`{
            "templates": {
                "someprocessor": {
                    "handlers": {
                        "processor": "hello"
                    }
                }
        }`

        assert.throws(
            () => new TemplatesConfigPopulator(inputJson)
                .ensureTemplateHandlerSectionExists('someprocessor', 'processor'),
            // tslint:disable-next-line:max-line-length
            /Invalid configuration. Field templates\/someprocessor\/handlers\/processor was expected to be an object, but was string instead/
        )
    })

    it('ensureTemplateHandlerSectionExists handles missing handlers section', async () => {
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

        const results = new TemplatesConfigPopulator(inputJson)
            .ensureTemplateHandlerSectionExists('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.json),
            JSON.stringify(expectedJson)
        )
    })

    it('ensureTemplateHandlerSectionExists handles missing handler section', async () => {
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

        const results = new TemplatesConfigPopulator(inputJson)
            .ensureTemplateHandlerSectionExists('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.json),
            JSON.stringify(expectedJson)
        )
    })

    it('ensureTemplateHandlerPropertiesExist handles clean data', async () => {
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

        const results = new TemplatesConfigPopulator(inputJson)
            .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, false, 'Expected results to be clean')
        assert.strictEqual(
            JSON.stringify(results.json),
            JSON.stringify(inputJson)
        )
    })

    it('ensureTemplateHandlerPropertiesExist errs with invalid handler type', async () => {
        const inputJson: string = String.raw`{
            "templates": {
                "someprocessor": {
                    "handlers": {
                        "processor": "hello"
                    }
                }
        }`

        assert.throws(
            () => new TemplatesConfigPopulator(inputJson)
                .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor'),
            // tslint:disable-next-line:max-line-length
            /Invalid configuration. Field templates\/someprocessor\/handlers\/processor was expected to be an object, but was string instead/
        )
    })

    it('ensureTemplateHandlerPropertiesExist errs with invalid event type', async () => {
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
            () => new TemplatesConfigPopulator(inputJson)
                .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor'),
            // tslint:disable-next-line:max-line-length
            /Invalid configuration. Field templates\/someprocessor\/handlers\/processor\/event was expected to be an object, but was number instead/
        )
    })

    it('ensureTemplateHandlerPropertiesExist handles missing everything', async () => {
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

        const results = new TemplatesConfigPopulator(inputJson)
            .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.json),
            JSON.stringify(expectedJson)
        )
    })

    it('ensureTemplateHandlerPropertiesExist handles missing event', async () => {
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

        const results = new TemplatesConfigPopulator(inputJson)
            .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.json),
            JSON.stringify(expectedJson)
        )
    })

    it('ensureTemplateHandlerPropertiesExist handles missing envvars', async () => {
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

        const results = new TemplatesConfigPopulator(inputJson)
            .ensureTemplateHandlerPropertiesExist('someprocessor', 'processor')
            .getResults()

        assert.strictEqual(results.isDirty, true, 'Expected results to be dirty')
        assert.strictEqual(
            JSON.stringify(results.json),
            JSON.stringify(expectedJson)
        )
    })
})
