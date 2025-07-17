/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Workbench, WebviewView } from 'vscode-extension-tester'

export interface TestContext {
    workbench?: Workbench
    webviewView?: WebviewView
}

// arr to store shared context
export const testContext: TestContext = {}
