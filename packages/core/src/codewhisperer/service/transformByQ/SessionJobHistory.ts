/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { convertToTimeString } from '../../../shared/utilities/textUtilities'
import { getLogger } from '../../../shared/logger'
import { calculateTotalLatency } from '../../../amazonqGumby/telemetry/codeTransformTelemetry'
import { CodeTransformTelemetryState } from '../../../amazonqGumby/telemetry/codeTransformTelemetryState'
import { transformByQState, QCodeTransformHistory } from '../../models/model'

import * as fs from 'fs-extra'

export class SessionJobHistory {
    static readonly jobHistoryKey = `code-transform-job-history`
    private static readonly jobExpiryOffset = 7 * 24 * 60 * 60 * 1000 // 7 days in ms

    public static async update() {
        const history = this.get()
        // The summary path may be cleared in certain circumstances (accept / revoke changes or restart)
        // so we need to record this and reuse in case we had one
        const oldSummaryPath = history[transformByQState.getJobId()]?.summaryFile
        const oldPatchPath = history[transformByQState.getJobId()]?.patchFile

        history[transformByQState.getJobId()] = {
            expireOn: Date.now() + this.jobExpiryOffset,
            startTime: transformByQState.getStartTime(),
            projectName: transformByQState.getProjectName(),
            status: transformByQState.getPolledJobStatus(),
            duration: convertToTimeString(calculateTotalLatency(CodeTransformTelemetryState.instance.getStartTime())),
            summaryFile: oldSummaryPath || transformByQState.getSummaryFilePath(),
            patchFile: oldPatchPath || transformByQState.getResultArchiveFilePath(),
        }

        getLogger().info(
            `Updated HistoryEntry for jobId  ${transformByQState.getJobId()} summaryFile: ${transformByQState.getSummaryFilePath()} patchFile: ${transformByQState.getResultArchiveFilePath()}`
        )

        await transformByQState.getExtensionContext()?.workspaceState.update(this.jobHistoryKey, history)
    }

    public static get() {
        const history = transformByQState
            .getExtensionContext()
            ?.workspaceState.get<QCodeTransformHistory>(this.jobHistoryKey)
        return history === undefined ? {} : history
    }

    public static async evictExpired() {
        const history = this.get()
        const now = Date.now()
        Object.keys(history).forEach(jobId => {
            if (history[jobId].expireOn < now) {
                const path = history[jobId]?.patchFile
                if (path !== undefined && path !== '') {
                    this.deleteFolder(path)
                }
                delete history[jobId]
            }
        })
        await transformByQState.getExtensionContext()?.workspaceState.update(this.jobHistoryKey, history)
    }

    private static deleteFolder(path: string) {
        try {
            fs.rmSync(path, { recursive: true })
        } catch (e) {
            getLogger().error(`Failed to deleting expired artifact on path ${path}`)
        }
    }
}
