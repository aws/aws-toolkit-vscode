/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-ignore
import {findNames, findNamesWithInExtent} from './find-names';
import {extractContextFromJavaImports} from "./java-import-reader";


export interface FullyQualifiedName {
    source: string[],
    symbol: string[],
}

export interface FullyQualifiedNames {
    used: FullyQualifiedName[];
}

export interface CodeQuery {
    simpleNames: string[];
    fullyQualifiedNames: FullyQualifiedNames;
}

export interface CodeSelection {
    selectedCode: string;
    file?: {
        range: {
            start: {
                row: string;
                column: string;
            };
            end: {
                row: string;
                column: string;
            };
        };
        name: string;
    };
}

export class FqnExtractor {

    async readImports(fileText: string, languageId: string): Promise<Set<string>> {
        const names = await findNames(fileText, languageId);

        if (names.fullyQualified === undefined) {
            return new Set<string>()
        }

        if (languageId === 'java') {
            return new Set<string>(extractContextFromJavaImports(names));
        }

        return new Set<string>(names.fullyQualified?.declaredSymbols
            .map((symbol: { source: string[] }): string => {
                return symbol.source[0].replace('@', '')
            })
            .filter((source: string) => source.length !== 0))
    }

    async extractCodeQuery(fileText: string, languageId: string, selection: CodeSelection): Promise<{ codeQuery: CodeQuery | undefined, namesWereTruncated: boolean }> {
        const names = selection === undefined ? await findNames(fileText, languageId) :
            await findNamesWithInExtent(fileText, languageId, selection.file?.range.start.row, selection.file?.range.start.column, selection.file?.range.end.row, selection.file?.range.end.column);
        if (names === undefined || Object.keys(names).length === 0) {
            return {codeQuery: undefined, namesWereTruncated: false}
        }

        const {simpleNames, simpleNamesListWasLongerThanMaxLength} = this.prepareSimpleNames(names);

        const {usedFullyQualifiedNames, namesWereTruncated} = this.prepareFqns(names);

        return {
            codeQuery: {
                simpleNames: simpleNames,
                fullyQualifiedNames: { used: Array.from(usedFullyQualifiedNames) }
            },
            namesWereTruncated: simpleNamesListWasLongerThanMaxLength || namesWereTruncated
        }
    }

    private prepareSimpleNames(names: any): { simpleNames: string[], simpleNamesListWasLongerThanMaxLength: boolean } {
        let simpleNames: string[] = names.simple.usedSymbols
            .concat(names.simple.declaredSymbols)
            .map((elem: any) => elem.symbol.trim())
            .filter((name: string) => name.length < 129 && name.length > 1);

        const maxSimpleNames = 100;
        let simpleNamesListWasLongerThanMaxLength = false;

        if (simpleNames.length > maxSimpleNames) {
            simpleNamesListWasLongerThanMaxLength = true

            simpleNames = [...new Set(simpleNames)]

            if (simpleNames.length > maxSimpleNames) {
                simpleNames = simpleNames.sort((a, b) => a.length - b.length)
                simpleNames.splice(0, simpleNames.length - maxSimpleNames)
            }
        }

        return {simpleNames, simpleNamesListWasLongerThanMaxLength}
    }

    private prepareFqns(names: any): {
        readonly usedFullyQualifiedNames: Set<FullyQualifiedName>
        readonly namesWereTruncated: boolean
    } {
        const usedFullyQualifiedNames: Set<FullyQualifiedName> = new Set(
            names.fullyQualified.usedSymbols.map((name: any) => ({ source: name.source, symbol: name.symbol }))
        )

        const maxUsedFullyQualifiedNamesLength = 25

        if (usedFullyQualifiedNames.size > maxUsedFullyQualifiedNamesLength) {
            const usedFullyQualifiedNamesSorted = Array.from(usedFullyQualifiedNames).sort(
                (name, other) => name.source.length + name.symbol.length - (other.source.length + other.symbol.length)
            )
            return {
                usedFullyQualifiedNames: new Set<FullyQualifiedName>(
                    usedFullyQualifiedNamesSorted.slice(0, maxUsedFullyQualifiedNamesLength)
                ),
                namesWereTruncated: true,
            }
        }

        return {
            usedFullyQualifiedNames,
            namesWereTruncated: false,
        }
    }

}
