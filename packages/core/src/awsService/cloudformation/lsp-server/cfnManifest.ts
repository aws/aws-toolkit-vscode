/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Manifest } from '../../../shared/lsp/types'
import { CfnLspServerEnvType } from './lspServerConfig'
import { CfnLspVersion, mapLegacyLinux, useOldLinuxVersion } from './utils'
import { getLogger } from '../../../shared/logger/logger'

interface CfnReleaseManifest {
    manifestSchemaVersion: string
    isManifestDeprecated: boolean
    prod: CfnLspVersion[]
    beta: CfnLspVersion[]
    alpha: CfnLspVersion[]
}

/**
 * Converts the raw CFN release manifest into the shared Manifest type,
 * preferring the version flagged as `latest` if it exists.
 * Remaps legacy Linux targets when running on older glibc systems.
 */
export function parseCfnManifest(content: string, environment: CfnLspServerEnvType): Manifest {
    const raw: CfnReleaseManifest = JSON.parse(content)
    let versions: CfnLspVersion[] = raw[environment] ?? []

    if (useOldLinuxVersion()) {
        getLogger('awsCfnLsp').info('In a legacy or sandbox Linux environment')
        versions = mapLegacyLinux(versions)
    }

    const latestVersion = versions.find((v) => v.latest && !v.isDelisted)
    const effectiveVersions = latestVersion ? [latestVersion] : versions

    return {
        manifestSchemaVersion: raw.manifestSchemaVersion,
        artifactId: 'cloudformation-languageserver',
        artifactDescription: 'AWS CloudFormation Language Server',
        isManifestDeprecated: raw.isManifestDeprecated,
        versions: effectiveVersions,
    }
}
