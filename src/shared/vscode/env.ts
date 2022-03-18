/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as semver from 'semver'
import * as vscode from 'vscode'
import * as packageJson from '../../../package.json'

const ENVIRONMENT_ARN_KEY = '__ENVIRONMENT_ARN'

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
export function isReleaseVersion(prereleaseOk: boolean = false): boolean {
    return (prereleaseOk || !semver.prerelease(extensionVersion)) && extensionVersion !== TEST_VERSION
}

/**
 * Returns true if the extension is being ran from automation.
 */
export function isAutomation(): boolean {
    return isCI() || !!process.env['AWS_TOOLKIT_AUTOMATION']
}

export { extensionVersion }

/**
 * Returns true if the extension is being ran on the minimum version of VS Code as defined
 * by the `engines` field in `package.json`
 */
export function isMinimumVersion(): boolean {
    return vscode.version.startsWith(packageJson.engines.vscode.replace(/\^\~/, ''))
}

export function getMdeEnvArn(): string | undefined {
    return process.env[ENVIRONMENT_ARN_KEY]
}
