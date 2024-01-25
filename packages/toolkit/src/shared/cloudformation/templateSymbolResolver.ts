/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { load } from 'js-yaml'
import * as vscode from 'vscode'
import * as CloudFormation from './cloudformation'
import { waitUntil } from '../utilities/timeoutUtils'

/**
 * SAM template Lambda resource or API Gateway resource.
 */
export interface TemplateFunctionResource {
    name: string
    range: vscode.Range
    kind: 'function' | 'api'
}

/**
 * Parses symbols in a CloudFormation text document.
 */
export class TemplateSymbolResolver {
    public constructor(
        private readonly document: vscode.TextDocument,
        // YAML symbol provider (we registered *.yaml in activateCodeLensProviders()).
        private readonly symbolProvider = new TemplateSymbolProvider()
    ) {}

    /**
     * Extracts Function or implicit Api resources from the document.
     *
     * - Function (no Api): `AWS::Serverless::Function` _without_ `Events.Type=Api`.
     * - Implicit Api: `AWS::Serverless::Function` with `Events.Type=Api`.
     * - Explicit Api: `AWS::Serverless::Api`.
     */
    public async getResourcesOfKind(
        kind: 'function' | 'api',
        waitForSymbols: boolean
    ): Promise<TemplateFunctionResource[]> {
        const allSymbols = await this.symbolProvider.getSymbols(this.document, waitForSymbols)
        // Only want top level (TODO: is this actually true?)
        const funSymbols = (
            allSymbols.find(o => o.name === 'Resources' && o.kind === vscode.SymbolKind.Module)?.children ?? []
        ).filter(r => this.isCfnType(CloudFormation.SERVERLESS_FUNCTION_TYPE, r))
        if (kind === 'function') {
            return funSymbols.map(r => ({ name: r.name, range: r.range, kind: kind }))
        }
        // Api symbols:
        //
        // For each Function symbol, find its Api descendants, keeping
        // track of the associated resource (Function) name.
        const apiSymbols: TemplateFunctionResource[] = []
        for (const funSymbol of funSymbols) {
            const found = this.findDescendants([funSymbol], 'Events', vscode.SymbolKind.Module).filter(r =>
                this.isCfnType('Api', r)
            )
            apiSymbols.push(
                ...found.map(o => ({
                    // We want the resource name of the Function node (not Api,
                    // that node is always named "Events".)
                    name: funSymbol.name,
                    range: o.range,
                    kind: kind,
                }))
            )
        }
        return apiSymbols
    }

    /**
     * Searches the tree (recursively) and returns all matching nodes.
     */
    private findDescendants(
        symbols: vscode.DocumentSymbol[],
        name: string,
        kind: vscode.SymbolKind
    ): vscode.DocumentSymbol[] {
        const found = symbols.filter(v => v.name === name && v.kind === kind)
        for (const s of symbols) {
            found.push(...this.findDescendants(s.children, name, kind))
        }
        return found
    }

    /**
     * Checks if `symbol` has a "Type: ..." child node where "..." is the
     * (case-sensitive) value given by `cfnType` .
     *
     * @param cfnType  Type name found in a "Type: ..." child node.
     */
    private isCfnType(cfnType: 'AWS::Serverless::Function' | 'Api', symbol: vscode.DocumentSymbol) {
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
        if (!typeSymbol) {
            return false
        }
        const parsedSymbol = load(this.symbolProvider.getText(typeSymbol, this.document)) as { Type: string }
        return parsedSymbol.Type === cfnType
    }
}

export class TemplateSymbolProvider {
    public async getSymbols(document: vscode.TextDocument, waitForSymbols: boolean): Promise<vscode.DocumentSymbol[]> {
        const symbols = await waitUntil(
            async function () {
                return await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    document.uri
                )
            },
            { timeout: waitForSymbols ? 10000 : 0, interval: 500, truthy: false }
        )
        return symbols ?? []
    }

    public getText(symbol: vscode.DocumentSymbol, document: vscode.TextDocument): string {
        return document.getText(symbol.range)
    }
}
