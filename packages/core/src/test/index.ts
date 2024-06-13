/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { runTests } from './testRunner'

export function run(): Promise<void> {
    return runTests(process.env.TEST_DIR ?? 'src/test', ['src/test/globalSetup.test.ts'])
}

export { registerAuthHook, using } from './setupUtil'
export { runTests } from './testRunner'
export { MockDocument } from './fake/fakeDocument'
export { FakeMemento, FakeExtensionContext } from './fakeExtensionContext'
export { Stub, stub } from './utilities/stubber'
export { getTestWindow } from './shared/vscode/window'
export { SeverityLevel } from './shared/vscode/message'
export { getTestLogger } from './globalSetup.test'
export { testCommand } from './shared/vscode/testUtils'
export { FakeAwsContext } from './utilities/fakeAwsContext'
export * from './codewhisperer/testUtil'
export * from './credentials/testUtil'
export * from './testUtil'
export * from './amazonqFeatureDev/utils'

import request from '../common/request'
import { stub } from 'sinon'

// Returns a stubbed fetch for other tests.
export function getFetchStubWithResponse(response: Partial<Response>) {
    return stub(request, 'fetch').returns({ response: new Promise((res, _) => res(response)) } as any)
}
