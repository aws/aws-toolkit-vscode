/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

import { populateRegistry } from '../../../shared/cloudformation/activation'
import { normalizePathIfWindows } from '../../../shared/utilities/pathUtils'
import { FakeRegistry } from './cloudformationTestUtils'

describe('CloudFormation activation', async () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
    })

    afterEach(async () => {
        sandbox.reset()
    })

    describe('populateRegistry', async () => {
        it ('attempts to populate the registry if a URI is sent along', async () => {
            const templateFile = normalizePathIfWindows(path.join('asdf', 'template.yaml'))
            const registry = new FakeRegistry()
            const addStub = sandbox.stub(registry, 'addTemplateToTemplateData')
            await populateRegistry(registry, [vscode.Uri.file(templateFile)])
            assert.ok(addStub.calledOnce)
        })

        it ('attempts to populate the registry n times when n URIs are sent along', async () => {
            const templateFile = normalizePathIfWindows(path.join('asdf', 'template.yaml'))
            const templateFile2 = normalizePathIfWindows(path.join('asdf', 'template2.yaml'))
            const registry = new FakeRegistry()
            const addStub = sandbox.stub(registry, 'addTemplateToTemplateData')
            await populateRegistry(registry, [vscode.Uri.file(templateFile), vscode.Uri.file(templateFile2)])
            assert.ok(addStub.calledTwice)
        })

        it ('does not break if a file cannot be parsed and throws an error', async () => {
            const templateFile = normalizePathIfWindows(path.join('asdf', 'template.yaml'))
            const templateFile2 = normalizePathIfWindows(path.join('asdf', 'template2.yaml'))
            const templateFile3 = normalizePathIfWindows(path.join('asdf', 'template3.yaml'))
            const registry = new FakeRegistry()
            const addStub = sandbox.stub(registry, 'addTemplateToTemplateData')
            addStub.onSecondCall().throws('not good!')
            await populateRegistry(registry, [vscode.Uri.file(templateFile), vscode.Uri.file(templateFile2), vscode.Uri.file(templateFile3)])
            assert.ok(addStub.calledThrice)
        })
    })
})
