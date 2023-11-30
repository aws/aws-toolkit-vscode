/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TextEditor, Selection, TextDocument, Range } from 'vscode'

import { Extent, Java, Python, Tsx, TypeScript, Location } from '@aws/fully-qualified-names'
import { FocusAreaContext, FullyQualifiedName } from './model'

const focusAreaCharLimit = 9_000

export class FocusAreaContextExtractor {
    public isCodeBlockSelected(editor: TextEditor): boolean {
        if (editor.document === undefined) {
            return false
        }

        // It means we don't really have a selection, but cursor position only
        if (
            editor.selection.start.line === editor.selection.end.line &&
            editor.selection.start.character === editor.selection.end.character
        ) {
            return false
        }

        return true
    }

    public async extract(editor: TextEditor): Promise<FocusAreaContext | undefined> {
        if (editor.document === undefined) {
            return undefined
        }

        let importantRange: Range = editor.selection

        // It means we don't really have a selection, but cursor position only
        if (!this.isCodeBlockSelected(editor)) {
            importantRange = editor.visibleRanges[0]
        }

        const names = await this.findNamesInRange(editor.document.getText(), importantRange, editor.document.languageId)

        const [simpleNames] = this.prepareSimpleNames(names)
        const [usedFullyQualifiedNames] = this.prepareFqns(names)

        importantRange = this.trimRangeAccordingToLimits(editor.document, importantRange)
        const codeBlock = this.getRangeText(editor.document, importantRange)
        const extendedCodeBlockRange = this.getExtendedCodeBlockRange(editor.document, importantRange)

        return {
            extendedCodeBlock: this.getRangeText(editor.document, extendedCodeBlockRange),
            codeBlock: codeBlock,
            selectionInsideExtendedCodeBlock: this.getSelectionInsideExtendedCodeBlock(
                importantRange as Selection,
                extendedCodeBlockRange
            ),
            names:
                simpleNames.length === 0 && usedFullyQualifiedNames.length === 0
                    ? undefined
                    : {
                          simpleNames,
                          fullyQualifiedNames: {
                              used: usedFullyQualifiedNames,
                          },
                      },
        }
    }

    private getSelectionInsideExtendedCodeBlock(
        originSelection: Selection,
        extendedCodeBlockRange: Range
    ): Selection | undefined {
        if (
            originSelection.start.line === originSelection.end.line &&
            originSelection.start.character === originSelection.end.character
        ) {
            return undefined
        }

        return new Selection(
            originSelection.start.line - extendedCodeBlockRange.start.line,
            originSelection.start.character,
            originSelection.end.line - extendedCodeBlockRange.start.line,
            originSelection.end.character
        )
    }

    private getExtendedCodeBlockRange(document: TextDocument, importantRange: Range): Range {
        let addLineBefore = true
        while (
            this.getRangeText(document, importantRange).length < focusAreaCharLimit &&
            (importantRange.start.line !== 0 || importantRange.end.line !== document.lineCount - 1)
        ) {
            if (addLineBefore && importantRange.start.line !== 0) {
                const tmpRange = new Range(
                    importantRange.start.line - 1,
                    0,
                    importantRange.end.line,
                    importantRange.end.character
                )
                addLineBefore = false

                if (this.getRangeText(document, tmpRange).length >= focusAreaCharLimit) {
                    break
                }

                importantRange = tmpRange
                continue
            }

            if (importantRange.end.line !== document.lineCount - 1) {
                const tmpRange = new Range(
                    importantRange.start.line,
                    importantRange.start.character,
                    importantRange.end.line + 1,
                    document.lineAt(importantRange.end.line + 1).range.end.character
                )

                if (this.getRangeText(document, tmpRange).length >= focusAreaCharLimit) {
                    break
                }

                importantRange = tmpRange
            }

            addLineBefore = true
        }

        return importantRange
    }

    private trimRangeAccordingToLimits(document: TextDocument, importantRange: Range): Range {
        while (
            this.getRangeText(document, importantRange).length > focusAreaCharLimit &&
            (importantRange.start.line !== importantRange.end.line ||
                (importantRange.start.line === importantRange.end.line &&
                    importantRange.start.character !== importantRange.end.character))
        ) {
            if (importantRange.end.line === 0) {
                break
            }
            importantRange = new Range(
                importantRange.start.line,
                importantRange.start.character,
                importantRange.end.line - 1,
                document.lineAt(importantRange.end.line - 1).range.end.character
            )
        }

        return importantRange
    }

    private getRangeText(document: TextDocument, range: Range): string {
        return document.getText(range)
    }

    private async findNamesInRange(fileText: string, selection: Range, languageId: string) {
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
        if (names === undefined || !names.fullyQualified) {
            return [[], false]
        }
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
        if (names === undefined || !names.simple) {
            return [[], false]
        }
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
