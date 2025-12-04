/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CfnLspName, CfnLspServerEnvType } from './lspServerConfig'
import {
    addWindows,
    CfnManifest,
    CfnTarget,
    CfnLspVersion,
    dedupeAndGetLatestVersions,
    extractPlatformAndArch,
    useOldLinuxVersion,
} from './utils'
import { getLogger } from '../../../shared/logger/logger'
import { ToolkitError } from '../../../shared/errors'

export class GitHubManifestAdapter {
    constructor(
        private readonly repoOwner: string,
        private readonly repoName: string,
        readonly environment: CfnLspServerEnvType
    ) {}

    async getManifest(): Promise<CfnManifest> {
        let manifest: CfnManifest
        try {
            manifest = await this.getManifestJson()
        } catch (err) {
            getLogger('awsCfnLsp').error(ToolkitError.chain(err, 'Failed to get CloudFormation manifest'))
            manifest = await this.getFromReleases()
        }

        getLogger('awsCfnLsp').info(
            'Candidate versions: %s',
            manifest.versions
                .map(
                    (v) =>
                        `${v.serverVersion}[${v.targets
                            .sort()
                            .map((t) => `${t.platform}-${t.arch}-${t.nodejs}`)
                            .join(',')}]`
                )
                .join(', ')
        )

        if (process.platform !== 'linux') {
            return manifest
        }

        const useFallbackLinux = useOldLinuxVersion()
        if (!useFallbackLinux) {
            return manifest
        }

        getLogger('awsCfnLsp').warn('Using GLIBC compatible version for Linux')
        const versions = manifest.versions.map((version) => {
            const targets = version.targets
                .filter((target) => {
                    return target.platform !== 'linux'
                })
                .map((target) => {
                    if (target.platform !== 'linuxglib2.28') {
                        return target
                    }

                    return {
                        ...target,
                        platform: 'linux',
                    }
                })

            return {
                ...version,
                targets,
            }
        })

        manifest.versions = versions

        getLogger('awsCfnLsp').info(
            'Remapped candidate versions from platform linuxglib2.28 to linux: %s',
            manifest.versions
                .map(
                    (v) =>
                        `${v.serverVersion}[${v.targets
                            .sort()
                            .map((t) => `${t.platform}-${t.arch}-${t.nodejs}`)
                            .join(',')}]`
                )
                .join(', ')
        )
        return manifest
    }

    private async getFromReleases(): Promise<CfnManifest> {
        const releases = await this.fetchGitHubReleases()
        const envReleases = this.filterByEnvironment(releases)
        const sortedReleases = envReleases.sort((a, b) => {
            return b.tag_name.localeCompare(a.tag_name)
        })
        const versions = dedupeAndGetLatestVersions(sortedReleases.map((release) => this.convertRelease(release)))
        getLogger('awsCfnLsp').info(
            'Candidate versions: %s',
            versions
                .map((v) => `${v.serverVersion}[${v.targets.map((t) => `${t.platform}-${t.arch}`).join(',')}]`)
                .join(', ')
        )
        return {
            manifestSchemaVersion: '1.0',
            artifactId: CfnLspName,
            artifactDescription: 'GitHub CloudFormation Language Server',
            isManifestDeprecated: false,
            versions: versions,
        }
    }

    private filterByEnvironment(releases: GitHubRelease[]): GitHubRelease[] {
        return releases.filter((release) => {
            const tag = release.tag_name
            if (this.environment === 'alpha') {
                return release.prerelease && tag.endsWith('-alpha')
            } else if (this.environment === 'beta') {
                return release.prerelease && tag.endsWith('-beta')
            } else {
                return !release.prerelease
            }
        })
    }

    private async fetchGitHubReleases(): Promise<GitHubRelease[]> {
        const response = await fetch(`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/releases`)
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`)
        }
        return response.json()
    }

    private convertRelease(release: GitHubRelease): CfnLspVersion {
        return {
            serverVersion: release.tag_name,
            isDelisted: false,
            targets: addWindows(this.extractTargets(release.assets)),
        }
    }

    private extractTargets(assets: GitHubAsset[]): CfnTarget[] {
        return assets.map((asset) => {
            const { arch, platform, nodejs } = extractPlatformAndArch(asset.name)

            return {
                platform,
                arch,
                nodejs,
                contents: [
                    {
                        filename: asset.name,
                        url: asset.browser_download_url,
                        hashes: [],
                        bytes: asset.size,
                    },
                ],
            }
        })
    }

    private async getManifestJson(): Promise<CfnManifest> {
        const response = await fetch(
            `https://raw.githubusercontent.com/${this.repoOwner}/${this.repoName}/refs/heads/main/assets/release-manifest.json`
        )
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`)
        }

        const json = (await response.json()) as Record<string, unknown>

        return {
            manifestSchemaVersion: json.manifestSchemaVersion as string,
            artifactId: json.artifactId as string,
            artifactDescription: json.artifactDescription as string,
            isManifestDeprecated: json.isManifestDeprecated as boolean,
            versions: json[this.environment] as CfnLspVersion[],
        }
    }
}

/* eslint-disable @typescript-eslint/naming-convention */
interface GitHubAsset {
    url: string
    browser_download_url: string
    id: number
    node_id: string
    name: string
    label: string | null
    state: string
    content_type: string
    size: number
    download_count: number
    created_at: string
    updated_at: string
}

interface GitHubRelease {
    url: string
    html_url: string
    assets_url: string
    upload_url: string
    tarball_url: string | null
    zipball_url: string | null
    id: number
    node_id: string
    tag_name: string
    target_commitish: string
    name: string | null
    body: string | null
    draft: boolean
    prerelease: boolean
    created_at: string // ISO 8601 date string
    published_at: string | null // ISO 8601 date string
    assets: GitHubAsset[]
}
