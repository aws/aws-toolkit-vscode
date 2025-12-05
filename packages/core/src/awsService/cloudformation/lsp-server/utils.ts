/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LspVersion, Target, Manifest } from '../../../shared/lsp/types'
import * as semver from 'semver'
import { CLibCheck } from './CLibCheck'
import { toString } from '../utils'
import { getLogger } from '../../../shared/logger/logger'

export interface CfnTarget extends Target {
    nodejs?: string
}
export interface CfnLspVersion extends LspVersion {
    targets: CfnTarget[]
}
export interface CfnManifest extends Manifest {
    versions: CfnLspVersion[]
}

export function addWindows(targets: CfnTarget[]): CfnTarget[] {
    const win32Targets = targets.filter((target) => {
        return target.platform === 'win32'
    })

    const windowsTargets = targets.filter((target) => {
        return target.platform === 'windows'
    })

    if (win32Targets.length < 1 || windowsTargets.length > 0) {
        return targets
    }

    return [
        ...targets,
        ...win32Targets.map((target) => {
            return {
                ...target,
                platform: 'windows',
            }
        }),
    ]
}

export function dedupeAndGetLatestVersions(versions: CfnLspVersion[]): CfnLspVersion[] {
    const grouped: Record<string, CfnLspVersion[]> = {}

    // Group by normalized version
    for (const version of versions) {
        const normalizedV = getMajorMinorPatchVersion(version.serverVersion)
        if (!grouped[normalizedV]) {
            grouped[normalizedV] = []
        }
        grouped[normalizedV].push(version)
    }

    const groupedAndSorted: Record<string, CfnLspVersion[]> = Object.fromEntries(
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

export function extractPlatformAndArch(filename: string): { platform: string; arch: string; nodejs?: string } {
    const match = filename.match(/^cloudformation-languageserver-(.*)-(.*)-(x64|arm64)(?:-node(\d+))?\.zip$/)
    if (match === null) {
        throw new Error(`Could not extract platform from ${filename}`)
    }

    const platform = match[2]
    const arch = match[3]
    const nodejs = match[4]

    if (!platform || !arch) {
        throw new Error(`Unknown arch and platform ${arch} ${platform}`)
    }

    return { arch, platform, nodejs }
}

export function useOldLinuxVersion(): boolean {
    if (process.platform !== 'linux') {
        return false
    }

    if (process.env.SNAP !== undefined) {
        getLogger('awsCfnLsp').info('In Linux sandbox environment')
        return true
    }

    const glibcxx = CLibCheck.getGLibCXXVersions()
    const maxAvailGLibCXX = glibcxx.maxFound
    if (!maxAvailGLibCXX) {
        return false
    }

    getLogger('awsCfnLsp').info(`Found GLIBCXX ${toString(glibcxx)}`)
    return semver.lt(maxAvailGLibCXX, '3.4.29')
}
