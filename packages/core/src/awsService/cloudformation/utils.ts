/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionConfigKey, ExtensionId } from './extensionConfig'
import { Position } from 'vscode'
import { isAnonymousClientId } from '../../shared/telemetry/util'

export function toString(value: unknown): string {
    if (value === undefined || !['object', 'function'].includes(typeof value)) {
        return String(value)
    }

    return JSON.stringify(value)
}

export function formatMessage(message: string): string {
    return `${ExtensionId}: ${message}`
}

/**
 * A placeholder id is never forwarded so the server can assign its own; `getClientId` is memoized,
 * so the telemetry preference is checked here as well.
 */
export function clientIdForInitialization(telemetryEnabled: boolean, clientId: string): string | undefined {
    return telemetryEnabled && !isAnonymousClientId(clientId) ? clientId : undefined
}

const installFailureMessages: Record<string, string> = {
    ManifestFetchFailed: 'Failed to fetch CloudFormation LSP manifest. Check your network connection.',
    NoCompatibleVersion: 'No compatible CloudFormation LSP version found for your platform.',
    RemoteDownloadFailed: 'Failed to download CloudFormation LSP. Check your network connection.',
    ExtractionFailed: 'Failed to extract CloudFormation LSP.',
    HashIntegrityFailed: 'Downloaded file integrity check failed. The file may be corrupted.',
}

/** Emitted by `LspLauncher` when the server process could not be started even after a reinstall. */
const startFailedCode = 'LspStartFailed'
const startFailedMessage = 'CloudFormation language server failed to start. See the AWS Toolkit logs for details.'

/**
 * Maps a startup error to a user-facing message. Install errors (which identify a cause the user can
 * act on) take precedence over the generic process-start failure anywhere in the `cause` chain.
 */
export function startupFailureMessage(error: unknown): string | undefined {
    const codes = collectErrorCodes(error)
    const installCode = codes.find((code) => code in installFailureMessages)
    if (installCode) {
        return formatMessage(installFailureMessages[installCode])
    }
    if (codes.includes(startFailedCode)) {
        return formatMessage(startFailedMessage)
    }
    return undefined
}

function collectErrorCodes(error: unknown): string[] {
    const codes: string[] = []
    let current = error
    while (current instanceof Error) {
        const code = (current as Error & { code?: unknown }).code
        if (typeof code === 'string') {
            codes.push(code)
        }
        current = (current as Error & { cause?: unknown }).cause
    }
    return codes
}

export function commandKey(key: string): string {
    return `${ExtensionConfigKey}.${key}`
}

export const cloudFormationUiClickMetric = 'cloudformation_nodeExpansion'

export function getStackStatusClass(status?: string): string {
    if (!status) {
        return ''
    }
    // Terminal success states
    if (status.includes('COMPLETE') && !status.includes('ROLLBACK')) {
        return 'status-complete'
    }
    // Terminal failed states
    if (status.includes('FAILED') || status.includes('ROLLBACK')) {
        return 'status-failed'
    }
    // Transient states (in progress)
    if (status.includes('PROGRESS')) {
        return 'status-progress'
    }
    return ''
}

export function isStackInTransientState(status: string): boolean {
    return status.includes('_IN_PROGRESS') || status.includes('_CLEANUP_IN_PROGRESS')
}

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
