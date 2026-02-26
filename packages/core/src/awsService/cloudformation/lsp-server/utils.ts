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
    latest?: boolean
    targets: CfnTarget[]
}
export interface CfnManifest extends Manifest {
    versions: CfnLspVersion[]
}

export function useOldLinuxVersion(): boolean {
    if (process.platform !== 'linux') {
        return false
    }

    if (process.env.SNAP !== undefined) {
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

const LegacyLinuxGLibPlatform = 'linuxglib2.28'

export function mapLegacyLinux(versions: CfnLspVersion[]): CfnLspVersion[] {
    const remappedVersions: CfnLspVersion[] = []

    for (const version of versions) {
        const hasLegacyLinux = version.targets.some((t) => t.platform === LegacyLinuxGLibPlatform)

        if (!hasLegacyLinux) {
            getLogger('awsCfnLsp').warn(`Found no compatible legacy linux builds for ${version.serverVersion}`)
            remappedVersions.push(version)
        } else {
            const newTargets = version.targets
                .filter((target) => {
                    return target.platform !== 'linux'
                })
                .map((target) => {
                    if (target.platform !== LegacyLinuxGLibPlatform) {
                        return target
                    }

                    return {
                        ...target,
                        platform: 'linux',
                    }
                })

            remappedVersions.push({
                ...version,
                targets: newTargets,
            })
        }
    }

    return remappedVersions
}
