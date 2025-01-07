/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface JavaImport {
    readonly tld: string
    readonly organisation?: string
    readonly packages?: string[]
}

export function extractContextFromJavaImports(names: any): string[] {
    return names.fullyQualified?.declaredSymbols
        .map((symbol: any): JavaImport => {
            const sourcesCount = symbol.source.length
            return {
                tld: symbol.source[0],
                organisation: sourcesCount > 1 ? symbol.source[1] : undefined,
                packages: sourcesCount > 2 ? symbol.source.slice(2) : undefined,
            }
        })
        .map((javaImport: JavaImport): string => {
            const importStatement = toString(javaImport)
            if (commonJavaImportsPrefixesRegex.test(importStatement)) {
                return ''
            } else if (importStatement.startsWith(awsJavaSdkV1Prefix)) {
                // @ts-ignore
                return javaImport.packages?.at(1) ?? ''
            } else if (importStatement.startsWith(awsJavaSdkV2Prefix)) {
                // @ts-ignore
                return javaImport.packages?.at(2) ?? ''
            } else {
                // @ts-ignore
                return javaImport.packages?.at(0) ?? javaImport.organisation ?? javaImport.tld
            }
        })
        .filter((context: string) => context !== '')
}

function toString(javaImport: JavaImport): string {
    let importSegments: string[] = []
    importSegments.push(javaImport.tld)
    if (javaImport.organisation !== undefined) {
        importSegments.push(javaImport.organisation)
    }
    if (javaImport.packages !== undefined) {
        importSegments = importSegments.concat(javaImport.packages)
    }
    return importSegments.join('.') + '.'
}

const commonJavaImportsPrefixesRegex = new RegExp(
    '^(java.|javax.|org.slf4j.|org.apache.log4j.|org.apache.logging.log4j.|org.junit.|org.testng.)'
)

const awsJavaSdkV1Prefix = 'com.amazonaws.services'

const awsJavaSdkV2Prefix = 'software.amazon.awssdk.services'
