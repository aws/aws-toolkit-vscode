/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { logAndThrowIfUnexpectedExitCode, SamCliProcessInvoker } from './samCliInvokerUtils'
import path from 'path'
import * as os from 'os'
import { Auth } from '../../../auth/auth'
import { injectCredentials } from '../sync'

export const TestEventsOperation = {
    List: 'list',
    Get: 'get',
    Put: 'put',
}
export interface SamCliRemoteTestEventsParameters {
    stackName: string
    operation: string
    name?: string
    region?: string
    eventSample?: string
    projectRoot?: vscode.Uri
}

export async function runSamCliRemoteTestEvents(
    remoteTestEventsParameters: SamCliRemoteTestEventsParameters,
    invoker: SamCliProcessInvoker
): Promise<string> {
    const args = [
        'remote',
        'test-event',
        remoteTestEventsParameters.operation,
        '--stack-name',
        remoteTestEventsParameters.stackName,
    ]

    if (remoteTestEventsParameters.region) {
        args.push('--region', remoteTestEventsParameters.region)
    }

    if (remoteTestEventsParameters.name) {
        args.push('--name', remoteTestEventsParameters.name)
    }

    if (remoteTestEventsParameters.operation === TestEventsOperation.Put && remoteTestEventsParameters.eventSample) {
        const tempFileUri = vscode.Uri.file(path.join(os.tmpdir(), 'event-sample.json'))
        await vscode.workspace.fs.writeFile(tempFileUri, Buffer.from(remoteTestEventsParameters.eventSample, 'utf8'))
        args.push('--file', tempFileUri.fsPath)
    }
    // try to use connection, ignore if no active iam connection
    const connection = Auth.instance.activeConnection

    const childProcessResult = await invoker.invoke({
        arguments: args,
        spawnOptions: {
            env:
                connection?.type === 'iam' && connection.state === 'valid'
                    ? await injectCredentials(connection)
                    : undefined,
            cwd: remoteTestEventsParameters.projectRoot?.fsPath,
        },
    })
    logAndThrowIfUnexpectedExitCode(childProcessResult, 0)

    return childProcessResult.stdout
}
