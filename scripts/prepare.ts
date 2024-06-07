/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Performs NPM "prepare" step, except when running in CI.
//
// prepare: https://docs.npmjs.com/cli/v9/using-npm/scripts#prepare-and-prepublish:
//  - Runs BEFORE the package is packed, i.e. during "npm publish" AND "npm pack".
//  - Runs on local "npm install".
//  - Runs AFTER `prepublish`, but BEFORE `prepublishOnly`.
//  - Runs in the background. To see the output, run with "--foreground-scripts".
//

import * as child_process from 'child_process'

/**
 * Returns true if the current build is running on CI (build server).
 */
export function isCI(): boolean {
    return undefined !== process.env['GITHUB_ACTION'] || undefined !== process.env['CODEBUILD_BUILD_ID']
}

function main() {
    if (isCI()) {
        console.log('prepare: skipped (running in CI)')
        return
    }
    child_process.execSync('husky', { stdio: 'inherit' })
}

main()
