/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpawnSyncOptions, spawnSync } from 'child_process'

export function runCmd(args: string[], options?: SpawnSyncOptions & { throws?: boolean }) {
    const result = spawnSync(args[0], args.slice(1), options)

    const throws = options?.throws ?? true
    if (throws && result.status !== 0) {
        throw new Error(`
-----
Error running: $ ${args.join(' ')}

status: ${result.status}
error: ${result.error?.toString()}
stdout: ${result.stdout?.toString()}
stderr: ${result.stderr?.toString()}
-----`)
    }
    return result
}
