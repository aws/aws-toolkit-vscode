/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TextEditor, Selection, TextDocument, Range } from 'vscode'

import { Extent, Java, Python, Tsx, TypeScript, Location } from '@aws/fully-qualified-names'
import { CodeSelectionContext, FullyQualifiedName } from './model'

export class CodeSelectionContextExtractor {
    public async extract(editor: TextEditor): Promise<CodeSelectionContext | undefined> {
        if (editor.document === undefined) {
            return undefined
        }

        const names = await this.findNamesInSelection(
            editor.document.getText(),
            editor.selection,
            editor.document.languageId
        )

        const [simpleNames] = this.prepareSimpleNames(names)
        const [usedFullyQualifiedNames] = this.prepareFqns(names)

        const selectedCode = this.getSelectionText(editor.document, editor.selection)

        if (simpleNames.length === 0 && usedFullyQualifiedNames.length === 0) {
            simpleNames.push(selectedCode)
        }

        const selection = editor.selection

        return {
            selectedCode,
            selection,
            names: {
                simpleNames,
                fullyQualifiedNames: {
                    used: usedFullyQualifiedNames,
                },
            },
        }
    }

    private getSelectionText(document: TextDocument, selection: Selection): string {
        const selectionRange = new Range(
            selection.start.line,
            selection.start.character,
            selection.end.line,
            selection.end.character
        )
        return document.getText(selectionRange)
    }

    private async findNamesInSelection(fileText: string, selection: Selection, languageId: string) {
        fileText.replace(/([\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF])/g, '')
        const startLocation: Location = new Location(selection.start.line, selection.start.character)
        const endLocation: Location = new Location(selection.end.line, selection.end.character)
        const extent: Extent = new Extent(startLocation, endLocation)

        let names: any = {}
        switch (languageId) {
            case 'java':
                names = await Java.findNamesWithInExtent(fileText, extent)
                break
            case 'javascript':
            case 'javascriptreact':
            case 'typescriptreact':
                names = await Tsx.findNamesWithInExtent(fileText, extent)
                break
            case 'python':
                names = await Python.findNamesWithInExtent(fileText, extent)
                break
            case 'typescript':
                names = await TypeScript.findNamesWithInExtent(fileText, extent)
                break
        }

        return names
    }

    private prepareFqns(names: any): [FullyQualifiedName[], boolean] {
        const dedupedUsedFullyQualifiedNames: Map<string, FullyQualifiedName> = new Map(
            names.fullyQualified.usedSymbols.map((name: any) => [
                JSON.stringify([name.source, name.symbol]),
                { source: name.source, symbol: name.symbol },
            ])
        )
        const usedFullyQualifiedNames = Array.from(dedupedUsedFullyQualifiedNames.values())

        const maxUsedFullyQualifiedNamesLength = 25

        if (usedFullyQualifiedNames.length > maxUsedFullyQualifiedNamesLength) {
            const usedFullyQualifiedNamesSorted = usedFullyQualifiedNames.sort(
                (name, other) => name.source.length + name.symbol.length - (other.source.length + other.symbol.length)
            )
            return [usedFullyQualifiedNamesSorted.slice(0, maxUsedFullyQualifiedNamesLength), true]
        }

        return [usedFullyQualifiedNames, false]
    }

    private prepareSimpleNames(names: any): [string[], boolean] {
        let simpleNames: string[] = names.simple.usedSymbols
            .concat(names.simple.declaredSymbols)
            .filter(function (elem: any) {
                const trimmedElem = elem.symbol.trim()
                return trimmedElem.length < 129 && trimmedElem.length > 1
            })
            .map(function (elem: any) {
                return elem.symbol.trim()
            })

        const maxSimpleNamesLength = 100

        let listWasLongerThanMaxLenght = false

        if (simpleNames.length > maxSimpleNamesLength) {
            listWasLongerThanMaxLenght = true

            simpleNames = [...new Set(simpleNames)]

            if (simpleNames.length > maxSimpleNamesLength) {
                simpleNames = simpleNames.sort((a, b) => a.length - b.length)
                simpleNames.splice(0, simpleNames.length - maxSimpleNamesLength)
            }
        }

        return [simpleNames, listWasLongerThanMaxLenght]
    }
}
