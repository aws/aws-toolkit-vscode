/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { strict as assert } from 'assert'
import sinon from 'sinon'
import { destructiveCommandWarningMessage, ExecuteBash } from '../../../codewhispererChat/tools/executeBash'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import * as vscode from 'vscode'

describe('ExecuteBash Tool', () => {
    let runStub: sinon.SinonStub
    let invokeStub: sinon.SinonStub

    beforeEach(() => {
        runStub = sinon.stub(ChildProcess.prototype, 'run')
        invokeStub = sinon.stub(ExecuteBash.prototype, 'invoke')
    })

    afterEach(() => {
        sinon.restore()
    })

    it('pass validation for a safe command (read-only)', async () => {
        runStub.resolves({
            exitCode: 0,
            stdout: '/bin/ls',
            stderr: '',
            error: undefined,
            signal: undefined,
        })
        const execBash = new ExecuteBash({ command: 'ls' })
        await execBash.validate()
    })

    it('fail validation if the command is empty', async () => {
        const execBash = new ExecuteBash({ command: '   ' })
        await assert.rejects(
            execBash.validate(),
            /Bash command cannot be empty/i,
            'Expected an error for empty command'
        )
    })

    it('set requiresAcceptance=true if the command has dangerous patterns', () => {
        const execBash = new ExecuteBash({ command: 'rm -rf /' })
        const needsAcceptance = execBash.requiresAcceptance().requiresAcceptance
        assert.equal(needsAcceptance, true, 'Should require acceptance for dangerous pattern')
        assert.equal(
            execBash.requiresAcceptance().warning,
            destructiveCommandWarningMessage,
            'Warning message should match the destructiveCommandWarningMessage'
        )
    })

    it('set requiresAcceptance=false if it is a read-only command', () => {
        const execBash = new ExecuteBash({ command: 'cat file.txt' })
        const needsAcceptance = execBash.requiresAcceptance().requiresAcceptance
        assert.equal(needsAcceptance, false, 'Read-only command should not require acceptance')
    })

    it('whichCommand cannot find the first arg', async () => {
        runStub.resolves({
            exitCode: 1,
            stdout: '',
            stderr: '',
            error: undefined,
            signal: undefined,
        })

        const execBash = new ExecuteBash({ command: 'noSuchCmd' })
        await assert.rejects(execBash.validate(), /not found on PATH/i, 'Expected not found error from whichCommand')
    })

    it('whichCommand sees first arg on PATH', async () => {
        runStub.resolves({
            exitCode: 0,
            stdout: '/usr/bin/noSuchCmd\n',
            stderr: '',
            error: undefined,
            signal: undefined,
        })

        const execBash = new ExecuteBash({ command: 'noSuchCmd' })
        await execBash.validate()
    })

    it('stub invoke() call', async () => {
        invokeStub.resolves({
            output: {
                kind: 'json',
                content: {
                    exitStatus: '0',
                    stdout: 'mocked stdout lines',
                    stderr: '',
                },
            },
        })

        const execBash = new ExecuteBash({ command: 'ls' })

        const dummyWritable = { write: () => {} } as any
        const result = await execBash.invoke(dummyWritable)

        assert.strictEqual(result.output.kind, 'json')
        const out = result.output.content as unknown as {
            exitStatus: string
            stdout: string
            stderr: string
        }
        assert.strictEqual(out.exitStatus, '0')
        assert.strictEqual(out.stdout, 'mocked stdout lines')
        assert.strictEqual(out.stderr, '')

        assert.strictEqual(invokeStub.callCount, 1)
    })

    it('requires acceptance if the command references an absolute file path outside the workspace', () => {
        // Stub workspace folders to simulate a workspace at '/workspace/folder'
        const workspaceStub = sinon
            .stub(vscode.workspace, 'workspaceFolders')
            .value([{ uri: { fsPath: '/workspace/folder' } } as any])
        // Command references an absolute path outside the workspace
        const execBash = new ExecuteBash({ command: 'cat /not/in/workspace/file.txt', cwd: '/workspace/folder' })
        const result = execBash.requiresAcceptance()

        assert.equal(
            result.requiresAcceptance,
            true,
            'Should require acceptance for an absolute path outside of workspace'
        )
        workspaceStub.restore()
    })

    it('does NOT require acceptance if the command references a relative file path inside the workspace', () => {
        // Stub workspace folders to simulate a workspace at '/workspace/folder'
        const workspaceStub = sinon
            .stub(vscode.workspace, 'workspaceFolders')
            .value([{ uri: { fsPath: '/workspace/folder' } } as any])

        // Command references a relative path that resolves within the workspace
        const execBash = new ExecuteBash({ command: 'cat ./file.txt', cwd: '/workspace/folder' })
        const result = execBash.requiresAcceptance()

        assert.equal(result.requiresAcceptance, false, 'Relative path inside workspace should not require acceptance')

        workspaceStub.restore()
    })

    it('does NOT require acceptance if there is no path-like token in the command', () => {
        // Stub workspace folders (even though they are not used in this case)
        const workspaceStub = sinon
            .stub(vscode.workspace, 'workspaceFolders')
            .value([{ uri: { fsPath: '/workspace/folder' } } as any])

        // Command with tokens that do not look like file paths
        const execBash = new ExecuteBash({ command: 'echo hello world', cwd: '/workspace/folder' })
        const result = execBash.requiresAcceptance()

        assert.equal(
            result.requiresAcceptance,
            false,
            'A command without any path-like token should not require acceptance'
        )

        workspaceStub.restore()
    })
})
