/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { mkdirpSync, readFileSync, rmdirSync } from 'fs-extra'
import * as vscode from 'vscode'
import { getSamCliContext } from '../../src/shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../src/shared/sam/cli/samCliInit'
import { TIMEOUT } from './integrationTestsUtilities'

describe('SAM', async () => {
    const projectFolder = `${__dirname}/python37sam`
    before(async function () {
        // tslint:disable-next-line: no-invalid-this
        this.timeout(TIMEOUT)
        const extension: vscode.Extension<void> | undefined = vscode.extensions.getExtension(
            'amazonwebservices.aws-toolkit-vscode'
        )
        assert.ok(extension)
        await extension!.activate()

        // this is really test 1, but since it has to run before everything it's in the before section
        try {
            rmdirSync(projectFolder)
        } catch (e) {}
        mkdirpSync(projectFolder)
        const initArguments: SamCliInitArgs = {
            name: 'testProject',
            location: projectFolder,
            runtime: 'python3.7'
        }
        console.log(initArguments.location)
        const samCliContext = getSamCliContext()
        await runSamCliInit(initArguments, samCliContext.invoker)
        const fileContents = readFileSync(`${projectFolder}/testProject/template.yaml`).toString()
        assert.ok(fileContents.includes('Runtime: python3.7'))
    })

    it('Does something with that python app', async () => {

    }).timeout(TIMEOUT)

    after(async () => {
        try {
            rmdirSync(projectFolder)
        } catch (e) {}
    })
})
