/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { WorkspaceFolder } from 'vscode'
import { ExportResultArchiveCommandInput } from '@amzn/codewhisperer-streaming'
import * as sinon from 'sinon'
import path from 'path'
import { fs, getRandomString } from '../../shared'
import { createTestWorkspace } from '../../test/testUtil'
import { getEqualOSTestOptions, performanceTest } from '../../shared/performance/performance'
import { downloadExportResultArchive } from '../../shared/utilities/download'
import { RegionProfile } from '../../codewhisperer'

interface SetupResult {
    workspace: WorkspaceFolder
    exportCommandInput: ExportResultArchiveCommandInput
    writeFileStub: sinon.SinonStub
    cwStreaming: any
    profile: RegionProfile
}

interface FakeCommandOutput {
    body: { binaryPayloadEvent: { bytes: Buffer } }[]
}

function generateCommandOutput(numPieces: number, pieceSize: number): FakeCommandOutput {
    const body = Array.from({ length: numPieces }, (_, i) => {
        return {
            binaryPayloadEvent: {
                bytes: Buffer.from(getRandomString(pieceSize)),
            },
        }
    })
    return { body }
}

async function setup(pieces: number, pieceSize: number): Promise<SetupResult> {
    // Force VSCode to find test workspace only to keep test contained and controlled.
    const workspace = await createTestWorkspace(1, {})
    const exportCommandInput = {} as ExportResultArchiveCommandInput
    // Manutally stub the CodeWhispererStreaming to avoid constructor call.
    const cwStreaming = { exportResultArchive: () => generateCommandOutput(pieces, pieceSize) }

    const writeFileStub = sinon.stub(fs, 'writeFile')
    const profile: RegionProfile = { name: 'foo', region: 'us-east-1', arn: 'foo-arn', description: '' }
    return { workspace, exportCommandInput, writeFileStub, cwStreaming, profile }
}

function perfTest(pieces: number, pieceSize: number, label: string) {
    return performanceTest(
        getEqualOSTestOptions({
            userCpuUsage: 200,
            systemCpuUsage: 35,
            heapTotal: 4,
        }),
        label,
        function () {
            return {
                setup: async () => await setup(pieces, pieceSize),
                execute: async ({
                    workspace,
                    cwStreaming,
                    exportCommandInput,
                    writeFileStub,
                    profile,
                }: SetupResult) => {
                    await downloadExportResultArchive(
                        cwStreaming,
                        exportCommandInput,
                        path.join(workspace.uri.fsPath, 'result'),
                        profile
                    )
                },
                verify: async (setup: SetupResult) => {
                    assert.ok(setup.writeFileStub.calledOnce)
                    assert.ok((setup.writeFileStub.firstCall.args[1] as Buffer).length === pieces * pieceSize)
                },
            }
        }
    )
}

describe('downloadExportResultArchive', function () {
    describe('performanceTests', function () {
        afterEach(function () {
            sinon.restore()
        })
        perfTest(1, 1000, '1x1KB')
        perfTest(10, 100, '10x100B')
        perfTest(100, 10, '100x10B')
        perfTest(1000, 1, '1000x1B')
    })
})
