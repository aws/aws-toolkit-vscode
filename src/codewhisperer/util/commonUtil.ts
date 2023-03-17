/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as semver from 'semver'
import { isCloud9 } from '../../shared/extensionUtilities'
import { getInlineSuggestEnabled } from '../../shared/utilities/editorUtilities'

export function getLocalDatetime() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return new Date().toLocaleString([], { timeZone: timezone })
}

export function asyncCallWithTimeout<T>(asyncPromise: Promise<T>, message: string, timeLimit: number): Promise<T> {
    let timeoutHandle: NodeJS.Timeout
    const timeoutPromise = new Promise((_resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(message)), timeLimit)
    })
    return Promise.race([asyncPromise, timeoutPromise]).then(result => {
        clearTimeout(timeoutHandle)
        return result as T
    })
}

export function isAwsError(error: any): boolean {
    return (
        typeof error?.name === 'string' &&
        typeof error.message === 'string' &&
        typeof error.code === 'string' &&
        error.time instanceof Date
    )
}

export function isInlineCompletionEnabled() {
    return semver.gte(vscode.version, '1.68.0') && getInlineSuggestEnabled() && !isCloud9()
}

export function getFileExt(languageId: string) {
    switch (languageId) {
        case 'java':
            return '.java'
        case 'python':
            return '.py'
        default:
            break
    }
    return undefined
}

/**
 * Returns the longest overlap between the Suffix of firstString and Prefix of second string
 * getPrefixSuffixOverlap("adwg31", "31ggrs") = "31"
 */
export function getPrefixSuffixOverlap(firstString: string, secondString: string) {
    let i = Math.min(firstString.length, secondString.length)
    while (i > 0) {
        if (secondString.slice(0, i) === firstString.slice(-i)) {
            break
        }
        i--
    }
    return secondString.slice(0, i)
}

export const normalizeOsName = (name: string, version: string | undefined): string => {
    const lowercaseName = name.toLowerCase()
    if (lowercaseName.includes('windows')) {
        if (!version) {
            return 'Windows'
        } else if (version.includes('Windows NT 10') || version.startsWith('10')) {
            return 'Windows 10'
        } else if (version.includes('6.1')) {
            return 'Windows 7'
        } else if (version.includes('6.3')) {
            return 'Windows 8.1'
        } else {
            return 'Windows'
        }
    } else if (
        lowercaseName.includes('macos') ||
        lowercaseName.includes('mac os') ||
        lowercaseName.includes('darwin')
    ) {
        return 'Mac OS X'
    } else if (lowercaseName.includes('linux')) {
        return 'Linux'
    } else {
        return name
    }
}
