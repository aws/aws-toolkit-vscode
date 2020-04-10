/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeLoad } from 'js-yaml'
import * as _ from 'lodash'
import * as vscode from 'vscode'
import { CloudFormation } from './cloudformation'

export interface TemplateFunctionResource {
    name: string
    range: vscode.Range
}

/**
 * Provides symbols for a TextDocument.
 */
export interface TemplateSymbolProvider {
    getSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]>
    getText(symbol: vscode.DocumentSymbol, document: vscode.TextDocument): string
}

/**
 * Parses symbols in a CloudFormation text document.
 */
export class TemplateSymbolResolver {
    public constructor(
        private readonly document: vscode.TextDocument,
        private readonly symbolProvider: TemplateSymbolProvider = new DefaultSymbolProvider()
    ) {}

    /**
     * Extracts Function resources from the document.
     */
    public async getFunctionResources(): Promise<TemplateFunctionResource[]> {
        const symbols = await this.symbolProvider.getSymbols(this.document)

        const resources = _(symbols).find({ name: 'Resources', kind: vscode.SymbolKind.Module })?.children ?? []

        return _(resources)
            .filter({ kind: vscode.SymbolKind.Module })
            .filter(resource => this.isFunctionResource(resource))
            .map(resource => ({ name: resource.name, range: resource.range }))
            .value()
    }

    private isFunctionResource(symbol: vscode.DocumentSymbol) {
        const typeSymbol = _(symbol.children).find({ name: 'Type', kind: vscode.SymbolKind.String })

        if (!typeSymbol) {
            return false
        }

        const parsedSymbol = safeLoad(this.symbolProvider.getText(typeSymbol, this.document)) as { Type: string }

        return parsedSymbol.Type === CloudFormation.SERVERLESS_FUNCTION_TYPE
    }
}

class DefaultSymbolProvider implements TemplateSymbolProvider {
    public async getSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        )

        return symbols ?? []
    }

    public getText(symbol: vscode.DocumentSymbol, document: vscode.TextDocument): string {
        return document.getText(symbol.range)
    }
}
