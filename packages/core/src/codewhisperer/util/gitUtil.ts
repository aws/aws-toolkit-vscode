/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { showOutputMessage } from '../../shared/utilities/messages'
import { getLogger, globals, removeAnsi } from '../../shared'
import { ChildProcess, ChildProcessOptions } from '../../shared/utilities/processUtils'
import { Uri } from 'vscode'

export async function isGitRepo(folder: Uri): Promise<boolean> {
    const childProcess = new ChildProcess('git', ['rev-parse', '--is-inside-work-tree'])

    let output = ''
    const runOptions: ChildProcessOptions = {
        rejectOnError: true,
        rejectOnErrorCode: true,
        onStdout: (text) => {
            output += text
            showOutputMessage(removeAnsi(text), globals.outputChannel)
        },
        onStderr: (text) => {
            showOutputMessage(removeAnsi(text), globals.outputChannel)
        },
        spawnOptions: {
            cwd: folder.fsPath,
        },
    }

    try {
        await childProcess.run(runOptions)
        return output.trim() === 'true'
    } catch (err) {
        getLogger().warn(`Failed to run command \`${childProcess.toString()}\`: ${err}`)
        return false
    }
}
