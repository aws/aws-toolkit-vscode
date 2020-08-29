/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeLoad } from 'js-yaml'
import * as _ from 'lodash'
import * as vscode from 'vscode'
import { CloudFormation } from './cloudformation'

/**
 * SAM template Lambda resource or API Gateway resource.
 */
export interface TemplateFunctionResource {
    name: string
    range: vscode.Range
    kind: 'function' | 'api'
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
        // YAML symbol provider (we registered *.yaml in activateCodeLensProviders()).
        private readonly symbolProvider: TemplateSymbolProvider = new DefaultSymbolProvider()
    ) {}

    /**
     * Extracts Function or implicit Api resources from the document.
     *
     * - Function (no Api): `AWS::Serverless::Function` _without_ `Events.Type=Api`.
     * - Implicit Api: `AWS::Serverless::Function` with `Events.Type=Api`.
     * - Explicit Api: `AWS::Serverless::Api`.
     */
    public async getResourcesOfKind(kind: 'function' | 'api'): Promise<TemplateFunctionResource[]> {
        const allSymbols = await this.symbolProvider.getSymbols(this.document)
        const wantSymbol = kind === 'function' ? 'Resources' : 'Events'
        let symbols
        if (kind === 'function') {
            // Only want top level (todo: is this actually true?)
            symbols = _(allSymbols).find({ name: wantSymbol, kind: vscode.SymbolKind.Module })?.children ?? []
        } else {
            symbols = this.findDescendants(allSymbols, wantSymbol, vscode.SymbolKind.Module)
        }
        return _(symbols)
            .filter({ kind: vscode.SymbolKind.Module })
            .filter(r => this.isKind(kind, r))
            .map(r => ({ name: r.name, range: r.range, kind: kind }))
            .value()
    }

    /**
     * Searches the tree and returns all matching nodes.
     */
    private findDescendants(
        symbols: vscode.DocumentSymbol[],
        name: string,
        kind: vscode.SymbolKind
    ): vscode.DocumentSymbol[] {
        const found = symbols.filter(v => v.name === name && v.kind === kind)
        for (let s of symbols) {
            found.push(...this.findDescendants(s.children, name, kind))
        }
        return found
    }

    private isKind(kind: 'function' | 'api', symbol: vscode.DocumentSymbol) {
        // Example:
        // ------------------------------------
        // Resources:
        //   ImplicitApiFunction:
        //     Type: AWS::Serverless::Function
        //     Properties:
        //       ...
        //       Events:             \
        //         GetHtml:           \
        //           Type: Api         \ presence of this means
        //           Properties:       / API instead of FUNCTION
        //             Path: /        /
        //             Method: get   /
        const typeSymbol = this.findDescendants(symbol.children, 'Type', vscode.SymbolKind.String)[0]
        const wantType = kind === 'function' ? CloudFormation.SERVERLESS_FUNCTION_TYPE : 'Api'
        if (!typeSymbol) {
            return false
        }
        const parsedSymbol = safeLoad(this.symbolProvider.getText(typeSymbol, this.document)) as { Type: string }
        return parsedSymbol.Type === wantType
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
