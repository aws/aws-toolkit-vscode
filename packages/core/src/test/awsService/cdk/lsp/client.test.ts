/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { Executable, LanguageClientOptions } from 'vscode-languageclient/node'
import {
    CdkLanguageServer,
    CdkLspDeps,
    openResourceCommand,
    ResourceChoice,
    toExecutable,
    watchRestartTriggers,
} from '../../../../awsService/cdk/lsp/client'
import { assertTelemetry, TestFolder } from '../../../testUtil'
import { getTestWindow } from '../../../shared/vscode/window'

describe('CdkLanguageServer', function () {
    let outputChannel: vscode.OutputChannel
    let root: TestFolder
    let appDir: string
    let settings: { appDir?: string; cliPath?: string }
    let trusted: boolean
    let appDirs: string[]
    let detectAppDirs: sinon.SinonSpy
    let clients: {
        executable: Executable
        options: LanguageClientOptions
        start: sinon.SinonStub
        stop: sinon.SinonStub
    }[]
    let startResult: () => Promise<void>
    let server: CdkLanguageServer

    beforeEach(async function () {
        outputChannel = vscode.window.createOutputChannel('CDK Language Server test')
        root = await TestFolder.create()
        appDir = await root.mkdir('app')
        // A workspace-local CLI that is new enough, so the server starts without touching PATH.
        await root.write(path.join('node_modules', '.bin', process.platform === 'win32' ? 'cdk.cmd' : 'cdk'))
        await root.write('node_modules/aws-cdk/package.json', JSON.stringify({ version: '2.1140.0' }))
        settings = {}
        trusted = true
        appDirs = [appDir]
        clients = []
        startResult = async () => {}
        detectAppDirs = sinon.spy(async () => appDirs)
        const deps: CdkLspDeps = {
            createClient: (executable, options) => {
                const client = {
                    executable,
                    options,
                    start: sinon.stub().callsFake(() => startResult()),
                    stop: sinon.stub().resolves(),
                }
                clients.push(client)
                return client
            },
            detectAppDirs,
            getSetting: (name) => settings[name],
            isTrusted: () => trusted,
        }
        server = new CdkLanguageServer(outputChannel, deps)
    })

    afterEach(async function () {
        await server.stop()
        outputChannel.dispose()
    })

    /** CDK messages only: the extension's own startup may show unrelated ones. */
    function messages(): string[] {
        return getTestWindow()
            .shownMessages.map((m) => m.message)
            .filter((m) => /cdk/i.test(m))
    }

    it('starts `cdk lsp` for the detected app', async function () {
        await server.restart()

        assert.strictEqual(clients.length, 1)
        const [client] = clients
        assert.ok(client.start.calledOnce)
        assert.deepStrictEqual(client.executable.args, ['lsp'])
        assert.strictEqual(client.executable.options?.cwd, appDir)
        assert.ok(!('transport' in client.executable), '`transport` would append a --stdio arg cdk rejects')
        assert.deepStrictEqual(client.options.initializationOptions, { applicationDir: appDir })
        assert.strictEqual(client.options.outputChannel, outputChannel)
        assertTelemetry('cdk_startLanguageServer', {
            result: 'Succeeded',
            cdkCliSource: 'nodeModules',
            cdkCliVersion: '2.1140.0',
        })
        assert.deepStrictEqual(messages(), [])
    })

    it('does nothing in an untrusted workspace', async function () {
        trusted = false

        await server.restart()

        assert.strictEqual(clients.length, 0)
        assert.ok(detectAppDirs.notCalled)
    })

    it('does nothing without a CDK app', async function () {
        appDirs = []

        await server.restart()

        assert.strictEqual(clients.length, 0)
        assert.deepStrictEqual(messages(), [])
    })

    it('uses the first of several apps and suggests aws.cdk.appDir', async function () {
        const other = await root.mkdir('other')
        appDirs = [other, appDir] // sorted, so `app` wins

        await server.restart()

        assert.strictEqual(clients[0].executable.options?.cwd, appDir)
        assert.match(messages()[0], /Multiple CDK apps found\. Using .*app\. Set aws\.cdk\.appDir/)
    })

    it('uses the aws.cdk.appDir setting instead of detection', async function () {
        settings.appDir = appDir

        await server.restart()

        assert.ok(detectAppDirs.notCalled)
        assert.strictEqual(clients[0].executable.options?.cwd, appDir)
    })

    it('resolves a relative aws.cdk.appDir against the first workspace folder', async function () {
        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath
        settings.appDir = path.relative(workspaceRoot, appDir)

        await server.restart()

        assert.strictEqual(clients[0].executable.options?.cwd, path.join(workspaceRoot, settings.appDir))
    })

    it('reports an aws.cdk.appDir that does not exist', async function () {
        settings.appDir = path.join(root.path, 'missing')

        await server.restart()

        assert.strictEqual(clients.length, 0)
        assert.match(messages()[0], /aws\.cdk\.appDir ".*missing" is not an existing directory/)
    })

    it('reports a missing CDK CLI', async function () {
        settings.cliPath = path.join(root.path, 'no-such-cdk')

        await server.restart()

        assert.strictEqual(clients.length, 0)
        assert.match(messages()[0], /need the AWS CDK CLI/)
        assertTelemetry('cdk_startLanguageServer', { result: 'Failed', reason: 'cdkCliNotFound' })
    })

    it('reports a local CDK CLI that is too old', async function () {
        await root.write('node_modules/aws-cdk/package.json', JSON.stringify({ version: '2.1131.0' }))

        await server.restart()

        assert.strictEqual(clients.length, 0)
        assert.match(messages()[0], /AWS CDK CLI 2\.1131\.0 is too old/)
        assertTelemetry('cdk_startLanguageServer', {
            result: 'Failed',
            reason: 'cdkCliOutdated',
            cdkCliSource: 'nodeModules',
            cdkCliVersion: '2.1131.0',
        })
    })

    it('reports a server that fails to start, and stops it', async function () {
        startResult = async () => {
            throw new Error('Unknown command: lsp')
        }

        await server.restart()

        assert.ok(clients[0].stop.calledOnce)
        assert.match(messages()[0], /Could not start the CDK language server/)
        assertTelemetry('cdk_startLanguageServer', {
            result: 'Failed',
            reason: 'startError',
            cdkCliSource: 'nodeModules',
            cdkCliVersion: '2.1140.0',
        })
    })

    it('stops the running client before starting a new one, even for overlapping restarts', async function () {
        await server.restart()
        const first = server.restart()
        const second = server.restart()
        await Promise.all([first, second])

        assert.strictEqual(clients.length, 3)
        assert.ok(clients[0].stop.calledOnce)
        assert.ok(clients[1].stop.calledOnce)
        assert.ok(clients[1].stop.calledBefore(clients[2].start), 'restarts must not overlap')
        assert.ok(clients[2].stop.notCalled)
    })

    it('stop() tolerates a client that fails to stop', async function () {
        await server.restart()
        clients[0].stop.rejects(new Error('Client is not running'))

        await server.stop()
        await server.stop() // second stop has no client
    })

    it('dispose() stops the client', async function () {
        await server.restart()

        server.dispose()

        assert.ok(clients[0].stop.calledOnce)
    })
})

describe('toExecutable', function () {
    it('spawns a plain executable directly', function () {
        assert.deepStrictEqual(toExecutable('/usr/bin/cdk', ['lsp'], '/app', { A: 'b' }), {
            command: '/usr/bin/cdk',
            args: ['lsp'],
            options: { cwd: '/app', env: { A: 'b' }, shell: false },
        })
    })

    it('spawns a Windows .cmd launcher through the shell, quoting its path', function () {
        const executable = toExecutable(
            'C:\\Users\\First Last\\app\\node_modules\\.bin\\cdk.CMD',
            ['lsp'],
            'C:\\app',
            {}
        )

        assert.strictEqual(executable.command, '"C:\\Users\\First Last\\app\\node_modules\\.bin\\cdk.CMD"')
        assert.strictEqual(executable.options?.shell, true)
    })
})

describe('watchRestartTriggers', function () {
    let disposables: vscode.Disposable[]
    let restart: sinon.SinonSpy

    beforeEach(function () {
        restart = sinon.spy()
        disposables = watchRestartTriggers(restart)
    })

    afterEach(async function () {
        for (const d of disposables) {
            d.dispose()
        }
        await vscode.workspace
            .getConfiguration('aws.cdk')
            .update('cliPath', undefined, vscode.ConfigurationTarget.Global)
    })

    it('restarts when a CDK setting changes', async function () {
        // cliPath, not appDir: the extension's own server (no CDK app in the test workspace) stays off either way.
        await vscode.workspace
            .getConfiguration('aws.cdk')
            .update('cliPath', '/no/such/cdk', vscode.ConfigurationTarget.Global)

        assert.ok(restart.called)
    })

    it('ignores unrelated setting changes', async function () {
        await vscode.workspace
            .getConfiguration('aws.samcli')
            .update('lambdaTimeout', 12345, vscode.ConfigurationTarget.Global)
        await vscode.workspace
            .getConfiguration('aws.samcli')
            .update('lambdaTimeout', undefined, vscode.ConfigurationTarget.Global)

        assert.ok(restart.notCalled)
    })
})

describe('openResourceCommand', function () {
    let template: string

    beforeEach(async function () {
        const folder = await TestFolder.create()
        template = await folder.write('cdk.out/Stack.template.json', '{\n  "Resources": {\n    "Bucket": {}\n  }\n}\n')
    })

    afterEach(async function () {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    })

    function choice(label: string, line: number): ResourceChoice {
        return {
            label,
            description: `MyStack/${label}`,
            target: {
                uri: vscode.Uri.file(template).toString(),
                range: { start: { line, character: 4 }, end: { line, character: 10 } },
            },
        }
    }

    function selection(): vscode.Selection | undefined {
        const editor = vscode.window.activeTextEditor
        return editor?.document.uri.fsPath === vscode.Uri.file(template).fsPath ? editor.selection : undefined
    }

    it('opens the only resource directly, selecting its range', async function () {
        await openResourceCommand([choice('AWS::S3::Bucket', 2)])

        assert.deepStrictEqual(selection(), new vscode.Selection(2, 4, 2, 10))
    })

    it('asks which resource to open when several share a line', async function () {
        getTestWindow().onDidShowQuickPick(async (picker) => {
            await picker.untilReady()
            picker.acceptItem(picker.items[1])
        })

        await openResourceCommand([choice('AWS::S3::Bucket', 1), choice('AWS::S3::BucketPolicy', 2)])

        assert.deepStrictEqual(selection(), new vscode.Selection(2, 4, 2, 10))
    })

    it('does nothing when the picker is dismissed', async function () {
        getTestWindow().onDidShowQuickPick(async (picker) => {
            await picker.untilReady()
            picker.hide()
        })

        await openResourceCommand([choice('AWS::S3::Bucket', 1), choice('AWS::S3::BucketPolicy', 2)])

        assert.strictEqual(selection(), undefined)
    })
})
