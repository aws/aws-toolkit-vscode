/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { mkdirpSync, readFileSync } from 'fs-extra';
import * as vscode from 'vscode'
import { getSamCliContext } from '../../src/shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../src/shared/sam/cli/samCliInit'
import { TIMEOUT } from './integrationTestsUtilities'

describe('SAM', async () => {
    before(async function () {
        // tslint:disable-next-line: no-invalid-this
        this.timeout(TIMEOUT)
        const extension: vscode.Extension<void> | undefined = vscode.extensions.getExtension(
            'amazonwebservices.aws-toolkit-vscode'
        )
        assert.ok(extension)
        await extension!.activate()
    })

    it('Creates a pyton3.7 SAM app', async () => {
        mkdirpSync(`${__dirname}/python37sam`)
        const initArguments: SamCliInitArgs = {
            name: 'testProject',
            location: `${__dirname}/python37sam`,
            runtime: 'python3.7'
        }
        console.log(initArguments.location)
        const samCliContext = getSamCliContext()
        await runSamCliInit(initArguments, samCliContext.invoker)
        const fileContents = readFileSync(`${__dirname}/python37sam/testProject/template.yaml`).toString()
        assert.ok(fileContents.includes('Runtime: python3.7'))
    }).timeout(TIMEOUT)
})
