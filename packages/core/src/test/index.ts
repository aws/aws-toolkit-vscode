/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Some imports in this file are node compatible only.
 * For web-based test imports, see {@link file://./../testWeb/index.ts}
 */

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
export { getTestWorkspaceFolder } from '../testInteg/integrationTestsUtilities'
export * from './codewhisperer/testUtil'
export * from './credentials/testUtil'
export * from './testUtil'
export * from './amazonq/utils'
export * from './fake/mockFeatureConfigData'
export * from './shared/ui/testUtils'
