/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionConfigKey, ExtensionId } from './extensionConfig'
import { Position } from 'vscode'

export function toString(value: unknown): string {
    if (value === undefined || !['object', 'function'].includes(typeof value)) {
        return String(value)
    }

    return JSON.stringify(value)
}

export function formatMessage(message: string): string {
    return `${ExtensionId}: ${message}`
}

export function commandKey(key: string): string {
    return `${ExtensionConfigKey}.${key}`
}

export const cloudFormationUiClickMetric = 'cloudformation_nodeExpansion'

export function extractErrorMessage(error: unknown) {
    if (error instanceof Error) {
        const prefix = error.name === 'Error' ? '' : `${error.name}: `
        return `${prefix}${error.message}`
    }

    return toString(error)
}

/**
 * Finds the position of the parameter description value where the cursor should be placed.
 * Returns the position between the quotes of the Description property.
 */
export function findParameterDescriptionPosition(
    text: string,
    parameterName: string,
    documentType: string
): Position | undefined {
    const lines = text.split('\n')

    if (documentType === 'JSON') {
        return findJsonParameterDescriptionPosition(lines, parameterName)
    } else {
        return findYamlParameterDescriptionPosition(lines, parameterName)
    }
}

/**
 * Finds the description position in JSON format.
 * Looks for: "ParameterName": { ... "Description": "HERE" ... }
 */
function findParameterDescription(
    lines: string[],
    parameterPattern: RegExp,
    descriptionMatcher: (line: string) => { match: RegExpMatchArray; character: number } | undefined,
    endMatcher: (line: string) => boolean
): Position | undefined {
    let inParameter = false

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        if (!inParameter && parameterPattern.test(line)) {
            inParameter = true
            continue
        }

        if (inParameter) {
            const result = descriptionMatcher(line)
            if (result) {
                return new Position(i, result.character)
            }

            if (endMatcher(line)) {
                break
            }
        }
    }

    return undefined
}

function findJsonParameterDescriptionPosition(lines: string[], parameterName: string): Position | undefined {
    const parameterPattern = new RegExp(`^\\s*"${escapeRegex(parameterName)}"\\s*:\\s*\\{`)

    return findParameterDescription(
        lines,
        parameterPattern,
        (line) => {
            const match = line.match(/^(\s*)"Description"\s*:\s*"([^"]*)"/)
            return match
                ? { match, character: match[1].length + '"Description": "'.length + match[2].length }
                : undefined
        },
        (line) => !!line.match(/^\s*\}/)
    )
}

/**
 * Finds the description position in YAML format.
 * Looks for: ParameterName: ... Description: "HERE" ...
 */
function findYamlParameterDescriptionPosition(lines: string[], parameterName: string): Position | undefined {
    const parameterPattern = new RegExp(`^\\s*${escapeRegex(parameterName)}\\s*:`)

    return findParameterDescription(
        lines,
        parameterPattern,
        (line) => {
            const match = line.match(/^(\s*)Description\s*:\s*(['"]?)([^'"]*)\2/)
            return match
                ? { match, character: match[1].length + 'Description: '.length + match[2].length + match[3].length }
                : undefined
        },
        (line) => !!line.match(/^\s*\w+\s*:/) && !line.match(/^\s*(Type|Default|Description|AllowedValues)\s*:/)
    )
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
