/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CfnLspServerEnvType } from './lspServerConfig'
import { CfnManifest, CfnLspVersion, useOldLinuxVersion, mapLegacyLinux } from './utils'
import { getLogger } from '../../../shared/logger/logger'

const ManifestUrl =
    'https://raw.githubusercontent.com/aws-cloudformation/cloudformation-languageserver/refs/heads/main/assets/release-manifest.json'

export class GitHubManifestAdapter {
    private lastRawManifest?: string

    constructor(readonly environment: CfnLspServerEnvType) {}

    getLastRawManifest(): string | undefined {
        return this.lastRawManifest
    }

    async getManifest(): Promise<CfnManifest> {
        const response = await fetch(ManifestUrl)
        if (!response.ok) {
            throw new Error(`Manifest fetch failed: ${response.status}`)
        }

        const rawText = await response.text()
        this.lastRawManifest = rawText
        const json = JSON.parse(rawText) as Record<string, unknown>

        const versions = json[this.environment] as CfnLspVersion[] | undefined
        const manifest: CfnManifest = {
            manifestSchemaVersion: json.manifestSchemaVersion as string,
            artifactId: json.artifactId as string,
            artifactDescription: json.artifactDescription as string,
            isManifestDeprecated: json.isManifestDeprecated as boolean,
            versions: versions ?? [],
        }

        getLogger('awsCfnLsp').info(
            'Candidate versions: %s',
            manifest.versions
                .map((v) => `${v.serverVersion}[${v.targets.map((t) => `${t.platform}-${t.arch}`).join(',')}]`)
                .join(', ')
        )

        if (process.platform === 'linux' && useOldLinuxVersion()) {
            getLogger('awsCfnLsp').info('In a legacy or sandbox Linux environment')
            manifest.versions = mapLegacyLinux(manifest.versions)
        }

        return manifest
    }
}
