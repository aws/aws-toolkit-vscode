/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Manifest, LspVersion, Target } from '../../../shared/lsp/types'
import { CfnLspName, CfnLspServerEnvType } from './lspServerConfig'
import { addWindows, dedupeAndGetLatestVersions } from './utils'
import { getLogger } from '../../../shared/logger/logger'

export class GitHubManifestAdapter {
    constructor(
        private readonly repoOwner: string,
        private readonly repoName: string,
        readonly environment: CfnLspServerEnvType
    ) {}

    async getManifest(): Promise<Manifest> {
        const releases = await this.fetchGitHubReleases()
        const envReleases = this.filterByEnvironment(releases)
        const sortedReleases = envReleases.sort((a, b) => {
            return b.tag_name.localeCompare(a.tag_name)
        })
        return {
            manifestSchemaVersion: '1.0',
            artifactId: CfnLspName,
            artifactDescription: 'GitHub CloudFormation Language Server',
            isManifestDeprecated: false,
            versions: dedupeAndGetLatestVersions(sortedReleases.map((release) => this.convertRelease(release))),
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

    private convertRelease(release: GitHubRelease): LspVersion {
        return {
            serverVersion: release.tag_name,
            isDelisted: false,
            targets: addWindows(this.extractTargets(release.assets)),
        }
    }

    private extractTargets(assets: GitHubAsset[]): Target[] {
        return this.filterByNodeVersion(assets).map((asset) => {
            const { arch, platform } = this.extractPlatformAndArch(asset.name)

            return {
                platform,
                arch,
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

    private filterByNodeVersion(assets: GitHubAsset[]): GitHubAsset[] {
        const hasNodeVersion = assets.map((asset) => asset.name).some((name) => name.includes('-node'))
        const nodeVersion = process.version.replaceAll('v', '').split('.')[0]

        if (hasNodeVersion) {
            const matchedVersion = assets.filter((asset) => {
                return asset.name.includes(`-node${nodeVersion}`)
            })

            if (matchedVersion.length > 0) {
                return matchedVersion
            }

            const latestVersion = this.getLatestNodeVersion(assets)
            getLogger().warn(`Could not find bundle for Node.js version ${nodeVersion}, using latest ${latestVersion}`)
            return assets.filter((asset) => asset.name.includes(`-node${latestVersion}`))
        }

        return assets
    }

    private extractPlatformAndArch(filename: string): {
        arch: string
        platform: string
    } {
        const lower = filename.toLowerCase().replaceAll(/-node.*$/g, '')
        const parts = lower.split('-')

        const arch = parts.pop()
        const platform = parts.pop()

        if (!platform || !arch) {
            throw new Error(`Unknown arch and platform ${arch} ${platform}`)
        }

        return { arch, platform }
    }

    private getLatestNodeVersion(assets: GitHubAsset[]): number {
        const versions = assets
            .map((asset) => {
                const match = asset.name.match(/-node(\d+)/)
                return match ? parseInt(match[1]) : undefined
            })
            .filter((v): v is number => v !== undefined)

        return Math.max(...versions)
    }
}

/* eslint-disable @typescript-eslint/naming-convention */
export interface GitHubAsset {
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

export interface GitHubRelease {
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
