/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import {
    SamParameterCompletionItemProvider,
    SamParameterCompletionItemProviderContext,
} from '../../../lambda/config/samParameterCompletionItemProvider'
import { CloudFormation } from '../../../shared/cloudformation/cloudformation'
import { Logger } from '../../../shared/logger'

function createTemplatesSymbol({
    uri = vscode.Uri.file(path.join('my', 'template', 'uri')),
    includeOverrides = false,
    parameterName,
}: {
    uri?: vscode.Uri
    includeOverrides?: boolean
    parameterName?: string
}) {
    const templatesSymbol = new vscode.DocumentSymbol(
        'templates',
        'myDetail',
        vscode.SymbolKind.Object,
        new vscode.Range(0, 0, 10, 0),
        new vscode.Range(0, 0, 0, 10)
    )

    if (!uri) {
        return templatesSymbol
    }

    const templateSymbol = new vscode.DocumentSymbol(
        uri.fsPath,
        'myDetail',
        vscode.SymbolKind.Object,
        new vscode.Range(1, 0, 9, 0),
        new vscode.Range(1, 0, 1, 10)
    )
    templatesSymbol.children.push(templateSymbol)

    if (!includeOverrides) {
        return templatesSymbol
    }

    const parameterOverridesSymbol = new vscode.DocumentSymbol(
        'parameterOverrides',
        'myDetail',
        vscode.SymbolKind.Object,
        new vscode.Range(2, 0, 8, 0),
        new vscode.Range(2, 0, 2, 10)
    )
    templateSymbol.children.push(parameterOverridesSymbol)

    if (!parameterName) {
        return templatesSymbol
    }

    const parameterOverrideSymbol = new vscode.DocumentSymbol(
        parameterName,
        'myDetail',
        vscode.SymbolKind.Property,
        new vscode.Range(3, 0, 7, 0),
        new vscode.Range(3, 0, 3, 10)
    )
    parameterOverridesSymbol.children.push(parameterOverrideSymbol)

    return templatesSymbol
}

class MockSamParameterCompletionItemProviderContext implements SamParameterCompletionItemProviderContext {
    public readonly logger: Pick<Logger, 'warn'>
    public readonly getWorkspaceFolder: typeof vscode.workspace.getWorkspaceFolder
    public readonly executeCommand: typeof vscode.commands.executeCommand
    public readonly loadTemplate: typeof CloudFormation.load

    public constructor({
        logger = {
            warn(...message: (Error | string)[]) {},
        },
        getWorkspaceFolder = uri => undefined,
        executeCommand = async (command, ...rest) => undefined,
        loadTemplate = async () => ({}),
    }: Partial<SamParameterCompletionItemProviderContext>) {
        this.logger = logger
        this.getWorkspaceFolder = getWorkspaceFolder
        this.executeCommand = executeCommand
        this.loadTemplate = loadTemplate
    }
}

describe('SamParameterCompletionItemProvider', async () => {
    it('recovers gracefully if document is not in a workspace', async () => {
        const warnArgs: (Error | string)[][] = []
        const provider = new SamParameterCompletionItemProvider(
            new MockSamParameterCompletionItemProviderContext({
                logger: {
                    warn(...message: (Error | string)[]) {
                        warnArgs.push(message)
                    },
                },
            })
        )

        const document: vscode.TextDocument = ({
            uri: vscode.Uri.file(path.join('my', 'path')),
        } as any) as vscode.TextDocument
        const actualItems = await provider.provideCompletionItems(
            document,
            new vscode.Position(0, 0),
            ({} as any) as vscode.CancellationToken,
            ({} as any) as vscode.CompletionContext
        )

        assert.ok(actualItems)
        assert.strictEqual(actualItems.length, 0)
        assert.strictEqual(warnArgs.length, 1)
        assert.strictEqual(warnArgs[0].length, 1)
        assert.strictEqual(
            warnArgs[0][0],
            `Cannot provide completion items for '${document.uri.fsPath}' beacuse it is not in the workspace.`
        )
    })

    it('does not provide suggestions if document symbols could not be loaded', async () => {
        const provider = new SamParameterCompletionItemProvider(
            new MockSamParameterCompletionItemProviderContext({
                executeCommand: async () => undefined,
                getWorkspaceFolder: () => (({ uri: vscode.Uri.file('') } as any) as vscode.WorkspaceFolder),
            })
        )

        const document: vscode.TextDocument = ({
            uri: vscode.Uri.file(path.join('my', 'path')),
        } as any) as vscode.TextDocument
        const actualItems = await provider.provideCompletionItems(
            document,
            new vscode.Position(0, 0),
            ({} as any) as vscode.CancellationToken,
            ({} as any) as vscode.CompletionContext
        )

        assert.ok(actualItems)
        assert.strictEqual(actualItems.length, 0)
    })

    it('does not provide suggestions if no matching template is found', async () => {
        const provider = new SamParameterCompletionItemProvider(
            new MockSamParameterCompletionItemProviderContext({
                executeCommand: async <T>() => ([] as any) as T,
                getWorkspaceFolder: () => (({ uri: vscode.Uri.file('') } as any) as vscode.WorkspaceFolder),
            })
        )

        const document: vscode.TextDocument = ({
            uri: vscode.Uri.file(path.join('my', 'path')),
        } as any) as vscode.TextDocument
        const actualItems = await provider.provideCompletionItems(
            document,
            new vscode.Position(0, 0),
            ({} as any) as vscode.CancellationToken,
            ({} as any) as vscode.CompletionContext
        )

        assert.ok(actualItems)
        assert.strictEqual(actualItems.length, 0)
    })

    it('suggests all parameter names if user has not started typing the parameter name', async () => {
        const templatesSymbol = createTemplatesSymbol({
            includeOverrides: true,
            parameterName: 'myParamName',
        })

        const provider = new SamParameterCompletionItemProvider(
            new MockSamParameterCompletionItemProviderContext({
                executeCommand: async <T>() => ([templatesSymbol] as any) as T,
                getWorkspaceFolder: () => (({ uri: vscode.Uri.file('') } as any) as vscode.WorkspaceFolder),
                loadTemplate: async () => ({
                    Parameters: {
                        MyParamName1: {
                            Type: 'String',
                        },
                        MyParamName2: {
                            Type: 'String',
                        },
                    },
                }),
            })
        )

        const document: vscode.TextDocument = ({
            uri: vscode.Uri.file(path.join('.aws', 'templates.json')),
            getWordRangeAtPosition: () => new vscode.Range(3, 0, 3, 10),
            getText: () => '',
        } as any) as vscode.TextDocument

        const actualItems = await provider.provideCompletionItems(
            document,
            new vscode.Position(3, 0),
            ({} as any) as vscode.CancellationToken,
            ({} as any) as vscode.CompletionContext
        )

        assert.ok(actualItems)
        assert.strictEqual(actualItems.length, 2)
        assert.strictEqual(actualItems[0].insertText, 'MyParamName1')
        assert.strictEqual(actualItems[1].insertText, 'MyParamName2')
    })

    it('suggests only matching parameter names if user has started typing the parameter name', async () => {
        const templatesSymbol = createTemplatesSymbol({
            includeOverrides: true,
            parameterName: 'myParamName',
        })

        const provider = new SamParameterCompletionItemProvider(
            new MockSamParameterCompletionItemProviderContext({
                executeCommand: async <T>() => ([templatesSymbol] as any) as T,
                getWorkspaceFolder: () => (({ uri: vscode.Uri.file('') } as any) as vscode.WorkspaceFolder),
                loadTemplate: async () => ({
                    Parameters: {
                        MyParamName1: {
                            Type: 'String',
                        },
                        MyParamName2: {
                            Type: 'String',
                        },
                        MyOtherParamName: {
                            Type: 'String',
                        },
                    },
                }),
            })
        )

        const document: vscode.TextDocument = ({
            uri: vscode.Uri.file(path.join('.aws', 'templates.json')),
            getWordRangeAtPosition: () => new vscode.Range(3, 0, 3, 10),
            getText: () => 'MyParamName',
        } as any) as vscode.TextDocument

        const actualItems = await provider.provideCompletionItems(
            document,
            new vscode.Position(3, 0),
            ({} as any) as vscode.CancellationToken,
            ({} as any) as vscode.CompletionContext
        )

        assert.ok(actualItems)
        assert.strictEqual(actualItems.length, 2)
        assert.strictEqual(actualItems[0].insertText, 'MyParamName1')
        assert.strictEqual(actualItems[1].insertText, 'MyParamName2')
    })

    it('recovers gracefully if templates.json is empty or invalid', async () => {
        const provider = new SamParameterCompletionItemProvider(
            new MockSamParameterCompletionItemProviderContext({
                executeCommand: async <T>() => undefined,
                getWorkspaceFolder: () => (({ uri: vscode.Uri.file('') } as any) as vscode.WorkspaceFolder),
            })
        )

        const actualItems = await provider.provideCompletionItems(
            ({ uri: vscode.Uri.file(path.join('.aws', 'templates.json')) } as any) as vscode.TextDocument,
            new vscode.Position(0, 0),
            ({} as any) as vscode.CancellationToken,
            ({} as any) as vscode.CompletionContext
        )

        assert.ok(actualItems)
        assert.strictEqual(actualItems.length, 0)
    })

    it('recovers gracefully if cursor is not within the `templates` property', async () => {
        const templatesSymbol = createTemplatesSymbol({
            includeOverrides: true,
            parameterName: 'myParamName',
        })

        const provider = new SamParameterCompletionItemProvider(
            new MockSamParameterCompletionItemProviderContext({
                executeCommand: async <T>() => ([templatesSymbol] as any) as T,
                getWorkspaceFolder: () => (({ uri: vscode.Uri.file('') } as any) as vscode.WorkspaceFolder),
                loadTemplate: async () => ({
                    Parameters: {
                        MyParamName1: {
                            Type: 'String',
                        },
                        MyParamName2: {
                            Type: 'String',
                        },
                        MyOtherParamName: {
                            Type: 'String',
                        },
                    },
                }),
            })
        )

        const document: vscode.TextDocument = ({
            uri: vscode.Uri.file(path.join('.aws', 'templates.json')),
            getWordRangeAtPosition: () => new vscode.Range(3, 0, 3, 10),
            getText: () => 'MyParamName',
        } as any) as vscode.TextDocument

        const actualItems = await provider.provideCompletionItems(
            document,
            new vscode.Position(11, 0),
            ({} as any) as vscode.CancellationToken,
            ({} as any) as vscode.CompletionContext
        )

        assert.ok(actualItems)
        assert.strictEqual(actualItems.length, 0)
    })

    it('recovers gracefully if `parameterOverrides` is not defined for this template', async () => {
        const templatesSymbol = createTemplatesSymbol({})
        const provider = new SamParameterCompletionItemProvider(
            new MockSamParameterCompletionItemProviderContext({
                executeCommand: async <T>() => ([templatesSymbol] as any) as T,
                getWorkspaceFolder: () => (({ uri: vscode.Uri.file('') } as any) as vscode.WorkspaceFolder),
                loadTemplate: async () => ({
                    Parameters: {
                        MyParamName1: {
                            Type: 'String',
                        },
                        MyParamName2: {
                            Type: 'String',
                        },
                        MyOtherParamName: {
                            Type: 'String',
                        },
                    },
                }),
            })
        )

        const document: vscode.TextDocument = ({
            uri: vscode.Uri.file(path.join('.aws', 'templates.json')),
            getWordRangeAtPosition: () => new vscode.Range(3, 0, 3, 10),
            getText: () => 'MyParamName',
        } as any) as vscode.TextDocument

        const actualItems = await provider.provideCompletionItems(
            document,
            new vscode.Position(11, 0),
            ({} as any) as vscode.CancellationToken,
            ({} as any) as vscode.CompletionContext
        )

        assert.ok(actualItems)
        assert.strictEqual(actualItems.length, 0)
    })

    it('recovers gracefully if cursor is not within the `parameterOverrides` property', async () => {
        const templatesSymbol = createTemplatesSymbol({
            includeOverrides: true,
            parameterName: 'myParamName',
        })

        const provider = new SamParameterCompletionItemProvider(
            new MockSamParameterCompletionItemProviderContext({
                executeCommand: async <T>() => ([templatesSymbol] as any) as T,
                getWorkspaceFolder: () => (({ uri: vscode.Uri.file('') } as any) as vscode.WorkspaceFolder),
                loadTemplate: async () => ({
                    Parameters: {
                        MyParamName1: {
                            Type: 'String',
                        },
                        MyParamName2: {
                            Type: 'String',
                        },
                        MyOtherParamName: {
                            Type: 'String',
                        },
                    },
                }),
            })
        )

        const document: vscode.TextDocument = ({
            uri: vscode.Uri.file(path.join('.aws', 'templates.json')),
            getWordRangeAtPosition: () => new vscode.Range(3, 0, 3, 10),
            getText: () => 'MyParamName',
        } as any) as vscode.TextDocument

        const actualItems = await provider.provideCompletionItems(
            document,
            new vscode.Position(9, 0),
            ({} as any) as vscode.CancellationToken,
            ({} as any) as vscode.CompletionContext
        )

        assert.ok(actualItems)
        assert.strictEqual(actualItems.length, 0)
    })

    it('recovers gracefully if cursor is not within a property name within `parameterOverrides`', async () => {
        const templatesSymbol = createTemplatesSymbol({
            includeOverrides: true,
            parameterName: 'myParamName',
        })

        const provider = new SamParameterCompletionItemProvider(
            new MockSamParameterCompletionItemProviderContext({
                executeCommand: async <T>() => ([templatesSymbol] as any) as T,
                getWorkspaceFolder: () => (({ uri: vscode.Uri.file('') } as any) as vscode.WorkspaceFolder),
                loadTemplate: async () => ({
                    Parameters: {
                        MyParamName1: {
                            Type: 'String',
                        },
                        MyParamName2: {
                            Type: 'String',
                        },
                        MyOtherParamName: {
                            Type: 'String',
                        },
                    },
                }),
            })
        )

        const document: vscode.TextDocument = ({
            uri: vscode.Uri.file(path.join('.aws', 'templates.json')),
            getWordRangeAtPosition: () => new vscode.Range(3, 0, 3, 10),
            getText: () => 'MyParamName',
        } as any) as vscode.TextDocument

        const actualItems = await provider.provideCompletionItems(
            document,
            new vscode.Position(4, 0),
            ({} as any) as vscode.CancellationToken,
            ({} as any) as vscode.CompletionContext
        )

        assert.ok(actualItems)
        assert.strictEqual(actualItems.length, 0)
    })
})
