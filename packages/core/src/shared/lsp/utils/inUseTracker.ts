/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'path'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports

const InUsePrefix = '.inuse.'

export class InUseTracker {
    writeMarker(versionDir: string, appName: string): void {
        try {
            const markerPath = join(versionDir, `${InUsePrefix}${process.pid}`)
            const tmpPath = `${markerPath}.tmp`
            nodeFs.writeFileSync(
                tmpPath,
                JSON.stringify({
                    pid: process.pid,
                    app: appName,
                    timestamp: Date.now(),
                })
            )
            nodeFs.renameSync(tmpPath, markerPath)
        } catch {}
    }

    removeMarker(versionDir: string): void {
        try {
            nodeFs.unlinkSync(join(versionDir, `${InUsePrefix}${process.pid}`))
        } catch {}
    }

    cleanStaleMarkers(versionDir: string): void {
        try {
            const entries = nodeFs.readdirSync(versionDir, { withFileTypes: true })
            for (const entry of entries) {
                if (entry.isFile() && entry.name.startsWith(InUsePrefix)) {
                    const pid = parseInt(entry.name.slice(InUsePrefix.length), 10)
                    if (!isNaN(pid) && !isPidAlive(pid)) {
                        try {
                            nodeFs.unlinkSync(join(versionDir, entry.name))
                        } catch {}
                    }
                }
            }
        } catch {}
    }

    isInUse(versionDir: string): boolean {
        try {
            const entries = nodeFs.readdirSync(versionDir, { withFileTypes: true })
            return entries.some((entry) => {
                if (!entry.isFile() || !entry.name.startsWith(InUsePrefix)) {
                    return false
                }
                const pid = parseInt(entry.name.slice(InUsePrefix.length), 10)
                return !isNaN(pid) && isPidAlive(pid)
            })
        } catch {
            return false
        }
    }
}

function isPidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}
