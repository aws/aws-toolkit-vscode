/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Workbench, WebviewView } from 'vscode-extension-tester'

export interface TestContext {
    workbench: Workbench
    webviewView: WebviewView
}

export const testContext = new Proxy<TestContext>({} as TestContext, {
    get(target, prop) {
        if (prop in target && target[prop as keyof TestContext] !== undefined) {
            return target[prop as keyof TestContext]
        }
        throw new Error(
            `TestContext.${String(prop)} is undefined. Make sure setup.ts has properly initialized the test context.`
        )
    },
    set(target, prop, value) {
        target[prop as keyof TestContext] = value
        return true
    },
})

export function initializeTestContext(workbench: Workbench, webviewView: WebviewView): void {
    testContext.workbench = workbench
    testContext.webviewView = webviewView
}
