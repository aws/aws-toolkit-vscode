/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LspVersion, Target } from '../../../shared/lsp/types'

export function addWindows(targets: Target[]): Target[] {
    const win32Targets = targets.filter((target) => {
        return target.platform === 'win32'
    })

    if (win32Targets.length < 1) {
        return targets
    }

    const windowsTargets: Target[] = win32Targets.map((target) => {
        return {
            ...target,
            platform: 'windows',
        }
    })

    return [...targets, ...windowsTargets]
}

export function dedupeAndGetLatestVersions(versions: LspVersion[]): LspVersion[] {
    const grouped: Record<string, LspVersion[]> = {}

    // Group by normalized version
    for (const version of versions) {
        const normalizedV = getMajorMinorPatchVersion(version.serverVersion)
        if (!grouped[normalizedV]) {
            grouped[normalizedV] = []
        }
        grouped[normalizedV].push(version)
    }

    const groupedAndSorted: Record<string, LspVersion[]> = Object.fromEntries(
        Object.entries(grouped).sort(([v1], [v2]) => {
            return compareVersionsDesc(v1, v2)
        })
    )

    // Sort each group by version descending and pick the first (latest)
    return Object.values(groupedAndSorted).map((group) => {
        group.sort((a, b) => compareVersionsDesc(a.serverVersion, b.serverVersion))
        const latest = group[0]
        latest.serverVersion = `${latest.serverVersion.replace('v', '')}`

        return latest // take the highest version
    })
}

function compareVersionsDesc(v1: string, v2: string) {
    const a = convertVersionToNumbers(v1)
    const b = convertVersionToNumbers(v2)

    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const partA = a[i] || 0
        const partB = b[i] || 0

        if (partA > partB) {
            return -1
        }
        if (partA < partB) {
            return 1
        }
    }
    return 0
}

function removeWordsFromVersion(version: string): string {
    return version.replaceAll('-beta', '').replaceAll('-alpha', '').replaceAll('-prod', '').replaceAll('v', '')
}

function convertVersionToNumbers(version: string): number[] {
    return removeWordsFromVersion(version).replaceAll('-', '.').split('.').map(Number)
}

function getMajorMinorPatchVersion(version: string): string {
    return removeWordsFromVersion(version).split('-')[0]
}
