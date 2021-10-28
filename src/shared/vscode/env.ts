/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as semver from 'semver'
import * as vscode from 'vscode'

/**
 * Components associated with {@link module:vscode.env}.
 */
export interface Env {
    clipboard: Clipboard
}

export namespace Env {
    export function vscode(): Env {
        return new DefaultEnv()
    }
}

export interface Clipboard {
    /**
     * See {@link module:vscode.Clipboard.writeText}.
     */
    writeText(message: string): Thenable<void>
}

class DefaultEnv implements Env {
    public get clipboard(): Clipboard {
        return vscode.env.clipboard
    }
}

/**
 * Returns true if the current build is running on CI (build server).
 */
export function isCI(): boolean {
    return undefined !== process.env['CODEBUILD_BUILD_ID']
}

/** Variable added via webpack */
declare let EXTENSION_VERSION: string
const TEST_VERSION = 'testPluginVersion'

/** The current extension version. If not built via Webpack, this defaults to {@link TEST_VERSION}. */
let extensionVersion = TEST_VERSION
try {
    extensionVersion = EXTENSION_VERSION
} catch (e) {} // Just a reference error

/**
 * Returns true if the current build is a production build (as opposed to a
 * prerelease/test/nightly build)
 */
export function isReleaseVersion(): boolean {
    return !semver.prerelease(extensionVersion) && extensionVersion !== TEST_VERSION
}

export { extensionVersion }
