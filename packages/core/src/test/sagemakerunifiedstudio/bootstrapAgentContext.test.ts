/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import fs from '../../shared/fs/fs'
import { createAgentsFile } from '../../sagemakerunifiedstudio/bootstrapAgentContext'
import { agentsFile, contextFile, importStatement, promptMessage } from '../../sagemakerunifiedstudio/shared/constants'
import { getTestWindow } from '../shared/vscode/window'

describe('AGENTS.md', function () {
    let sandbox: sinon.SinonSandbox
    let mockCtx: vscode.ExtensionContext
    let existsStub: sinon.SinonStub
    let writeStub: sinon.SinonStub

    const templateContent = '# SageMaker context'

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        mockCtx = {
            asAbsolutePath: sandbox.stub().callsFake((p: string) => `/fake/${p}`),
        } as any
        writeStub = sandbox.stub(fs, 'writeFile').resolves()
        existsStub = sandbox.stub(fs, 'existsFile')
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('createAgentsFile', function () {
        it('creates both files when neither exists', async function () {
            sandbox.stub(fs, 'readFileText').resolves(templateContent)
            existsStub.withArgs(contextFile).resolves(false)
            existsStub.withArgs(agentsFile).resolves(false)

            getTestWindow().onDidShowMessage((msg) => {
                if (msg.message === promptMessage) {
                    msg.selectItem('Yes')
                }
            })

            await createAgentsFile(mockCtx)

            assert.ok(writeStub.calledWith(contextFile, templateContent))
            assert.ok(writeStub.calledWith(agentsFile, importStatement + '\n'))
        })

        it('creates nothing when neither file exists and user declines', async function () {
            sandbox.stub(fs, 'readFileText').resolves(templateContent)
            existsStub.withArgs(contextFile).resolves(false)
            existsStub.withArgs(agentsFile).resolves(false)

            getTestWindow().onDidShowMessage((msg) => {
                if (msg.message === promptMessage) {
                    msg.close()
                }
            })

            await createAgentsFile(mockCtx)

            assert.ok(writeStub.notCalled)
        })

        it('updates smus-context.md and skips AGENTS.md when import already present', async function () {
            const agentsContent = `# My agents\n\n${importStatement}\n`
            const readStub = sandbox.stub(fs, 'readFileText')
            readStub.resolves(templateContent)
            readStub.withArgs(agentsFile).resolves(agentsContent)
            existsStub.withArgs(contextFile).resolves(true)
            existsStub.withArgs(agentsFile).resolves(true)

            await createAgentsFile(mockCtx)

            assert.ok(writeStub.calledOnceWith(contextFile, templateContent))
        })

        it('prompts and adds import when AGENTS.md exists without import and smus-context.md is new', async function () {
            const agentsContent = '# My agents\n'
            const readStub = sandbox.stub(fs, 'readFileText')
            readStub.resolves(templateContent)
            readStub.withArgs(agentsFile).resolves(agentsContent)
            existsStub.withArgs(contextFile).resolves(false)
            existsStub.withArgs(agentsFile).resolves(true)

            getTestWindow().onDidShowMessage((msg) => {
                if (msg.message === promptMessage) {
                    msg.selectItem('Yes')
                }
            })

            await createAgentsFile(mockCtx)

            assert.ok(writeStub.calledWith(contextFile, templateContent))
            assert.ok(writeStub.calledWith(agentsFile, agentsContent + '\n' + importStatement + '\n'))
        })

        it('creates nothing when user declines import prompt', async function () {
            const agentsContent = '# My agents\n'
            const readStub = sandbox.stub(fs, 'readFileText')
            readStub.resolves(templateContent)
            readStub.withArgs(agentsFile).resolves(agentsContent)
            existsStub.withArgs(contextFile).resolves(false)
            existsStub.withArgs(agentsFile).resolves(true)

            getTestWindow().onDidShowMessage((msg) => {
                if (msg.message === promptMessage) {
                    msg.close()
                }
            })

            await createAgentsFile(mockCtx)

            assert.ok(writeStub.notCalled)
        })

        it('respects user choice when smus-context.md exists but is not imported', async function () {
            const agentsContent = '# My agents\n'
            const readStub = sandbox.stub(fs, 'readFileText')
            readStub.resolves(templateContent)
            readStub.withArgs(agentsFile).resolves(agentsContent)
            existsStub.withArgs(contextFile).resolves(true)
            existsStub.withArgs(agentsFile).resolves(true)

            await createAgentsFile(mockCtx)

            // Only smus-context.md is written, AGENTS.md is not touched, no prompt
            assert.ok(writeStub.calledOnceWith(contextFile, templateContent))
        })

        it('does not throw when template read fails', async function () {
            sandbox.stub(fs, 'readFileText').rejects(new Error('file not found'))

            await assert.doesNotReject(() => createAgentsFile(mockCtx))
        })

        it('does not throw when write fails', async function () {
            sandbox.stub(fs, 'readFileText').resolves(templateContent)
            existsStub.resolves(false)
            writeStub.rejects(new Error('permission denied'))

            getTestWindow().onDidShowMessage((msg) => {
                if (msg.message === promptMessage) {
                    msg.selectItem('Yes')
                }
            })

            await assert.doesNotReject(() => createAgentsFile(mockCtx))
        })
    })
})
