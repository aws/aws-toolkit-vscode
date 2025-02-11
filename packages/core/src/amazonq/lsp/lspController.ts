/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from '../../shared/logger/logger'
import { CurrentWsFolders, collectFilesForIndex } from '../../shared/utilities/workspaceUtils'
import { LspClient } from './lspClient'
import { RelevantTextDocument } from '@amzn/codewhisperer-streaming'
import { activate as activateLsp } from './lspClient'
import { telemetry } from '../../shared/telemetry/telemetry'
import { isCloud9 } from '../../shared/extensionUtilities'
import globals, { isWeb } from '../../shared/extensionGlobals'
import { isAmazonInternalOs } from '../../shared/vscode/env'
import { WorkspaceLSPResolver } from './workspaceInstaller'
import { lspSetupStage } from '../../shared'

export interface Chunk {
    readonly filePath: string
    readonly content: string
    readonly context?: string
    readonly relativePath?: string
    readonly programmingLanguage?: string
}
export interface BuildIndexConfig {
    startUrl?: string
    maxIndexSize: number
    isVectorIndexEnabled: boolean
}

/*
 * LSP Controller manages the status of Amazon Q Workspace Indexing LSP:
 * 1. Downloading, verifying and installing LSP using DEXP LSP manifest and CDN.
 * 2. Managing the LSP states. There are a couple of possible LSP states:
 *    Not installed. Installed. Running. Indexing. Indexing Done.
 * LSP Controller converts the input and output of LSP APIs.
 * The IDE extension code should invoke LSP API via this controller.
 * 3. It perform pre-process and post process of LSP APIs
 *    Pre-process the input to Index Files API
 *    Post-process the output from Query API
 */
export class LspController {
    static #instance: LspController
    private _isIndexingInProgress = false
    private logger = getLogger('amazonqWorkspaceLsp')

    public static get instance() {
        return (this.#instance ??= new this())
    }

    isIndexingInProgress() {
        return this._isIndexingInProgress
    }

    async query(s: string): Promise<RelevantTextDocument[]> {
        const chunks: Chunk[] | undefined = await LspClient.instance.queryVectorIndex(s)
        const resp: RelevantTextDocument[] = []
        if (chunks) {
            for (const chunk of chunks) {
                const text = chunk.context ? chunk.context : chunk.content
                if (chunk.programmingLanguage && chunk.programmingLanguage !== 'unknown') {
                    resp.push({
                        text: text,
                        relativeFilePath: chunk.relativePath ? chunk.relativePath : path.basename(chunk.filePath),
                        programmingLanguage: {
                            languageName: chunk.programmingLanguage,
                        },
                    })
                } else {
                    resp.push({
                        text: text,
                        relativeFilePath: chunk.relativePath ? chunk.relativePath : path.basename(chunk.filePath),
                    })
                }
            }
        }
        return resp
    }

    async queryInlineProjectContext(query: string, path: string, target: 'bm25' | 'codemap' | 'default') {
        try {
            return await LspClient.instance.queryInlineProjectContext(query, path, target)
        } catch (e) {
            if (e instanceof Error) {
                this.logger.error(`unexpected error while querying inline project context, e=${e.message}`)
            }
            return []
        }
    }

    async buildIndex(buildIndexConfig: BuildIndexConfig) {
        this.logger.info(`LspController: Starting to build index of project`)
        const start = performance.now()
        const projPaths = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath)
        if (projPaths.length === 0) {
            this.logger.info(`LspController: Skipping building index. No projects found in workspace`)
            return
        }
        projPaths.sort()
        try {
            this._isIndexingInProgress = true
            const projRoot = projPaths[0]
            const files = await collectFilesForIndex(
                projPaths,
                vscode.workspace.workspaceFolders as CurrentWsFolders,
                true,
                buildIndexConfig.maxIndexSize * 1024 * 1024
            )
            const totalSizeBytes = files.reduce(
                (accumulator, currentFile) => accumulator + currentFile.fileSizeBytes,
                0
            )
            this.logger.info(`LspController: Found ${files.length} files in current project ${projPaths}`)
            const config = buildIndexConfig.isVectorIndexEnabled ? 'all' : 'default'
            const r = files.map((f) => f.fileUri.fsPath)
            const resp = await LspClient.instance.buildIndex(r, projRoot, config)
            if (resp) {
                this.logger.debug(`LspController: Finish building index of project`)
                const usage = await LspClient.instance.getLspServerUsage()
                telemetry.amazonq_indexWorkspace.emit({
                    duration: performance.now() - start,
                    result: 'Succeeded',
                    amazonqIndexFileCount: files.length,
                    amazonqIndexMemoryUsageInMB: usage ? usage.memoryUsage / (1024 * 1024) : undefined,
                    amazonqIndexCpuUsagePercentage: usage ? usage.cpuUsage : undefined,
                    amazonqIndexFileSizeInMB: totalSizeBytes / (1024 * 1024),
                    credentialStartUrl: buildIndexConfig.startUrl,
                })
            } else {
                this.logger.error(`LspController: Failed to build index of project`)
                telemetry.amazonq_indexWorkspace.emit({
                    duration: performance.now() - start,
                    result: 'Failed',
                    amazonqIndexFileCount: 0,
                    amazonqIndexFileSizeInMB: 0,
                    reason: `Unknown`,
                })
            }
        } catch (error) {
            // TODO: use telemetry.run()
            this.logger.error(`LspController: Failed to build index of project`)
            telemetry.amazonq_indexWorkspace.emit({
                duration: performance.now() - start,
                result: 'Failed',
                amazonqIndexFileCount: 0,
                amazonqIndexFileSizeInMB: 0,
                reason: `${error instanceof Error ? error.name : 'Unknown'}`,
                reasonDesc: `Error when building index. ${error instanceof Error ? error.message : error}`,
            })
        } finally {
            this._isIndexingInProgress = false
        }
    }

    async trySetupLsp(context: vscode.ExtensionContext, buildIndexConfig: BuildIndexConfig) {
        if (isCloud9() || isWeb() || isAmazonInternalOs()) {
            this.logger.warn('LspController: Skipping LSP setup. LSP is not compatible with the current environment. ')
            // do not do anything if in Cloud9 or Web mode or in AL2 (AL2 does not support node v18+)
            return
        }
        setImmediate(async () => {
            try {
                await this.setupLsp(context)
                void LspController.instance.buildIndex(buildIndexConfig)
                // log the LSP server CPU and Memory usage per 30 minutes.
                globals.clock.setInterval(
                    async () => {
                        const usage = await LspClient.instance.getLspServerUsage()
                        if (usage) {
                            this.logger.info(
                                `LspController: LSP server CPU ${usage.cpuUsage}%, LSP server Memory ${
                                    usage.memoryUsage / (1024 * 1024)
                                }MB  `
                            )
                        }
                    },
                    30 * 60 * 1000
                )
            } catch (e) {
                this.logger.error(`LspController: LSP failed to activate ${e}`)
            }
        })
    }

    private async setupLsp(context: vscode.ExtensionContext) {
        await lspSetupStage('all', async () => {
            const installResult = await new WorkspaceLSPResolver().resolve()
            await lspSetupStage('launch', async () => activateLsp(context, installResult.resourcePaths))
            this.logger.info('LspController: LSP activated')
        })
    }
}
