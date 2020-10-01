/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
'use strict'

/*
    This script is called from npm run compile. It copies the SSM Language Service bundle to `dist`.
*/

const fs = require('fs-extra')
const path = require('path')

const repoRoot = path.dirname(__dirname)
const outRoot = path.join(repoRoot, 'dist')

;(async () => {
    try {
        console.log('Copying SSM Document Language Service artifacts...')
        await fs.copy(
            path.resolve(repoRoot, 'node_modules/aws-ssm-document-language-service/dist/server.js'),
            path.resolve(outRoot, 'src/ssmDocument/ssm/ssmServer.js'),
            {
                overwrite: true,
                errorOnExist: false,
            }
        )
        await fs.copy(
            path.resolve(repoRoot, 'node_modules/aws-ssm-document-language-service/dist/server.js.LICENSE.txt'),
            path.resolve(outRoot, 'src/ssmDocument/ssm/ssmServer.js.LICENSE.txt'),
            {
                overwrite: true,
                errorOnExist: false,
            }
        )
        await fs.copy(
            path.resolve(repoRoot, 'node_modules/aws-ssm-document-language-service/dist/server.js.map'),
            path.resolve(outRoot, 'src/ssmDocument/ssm/ssmServer.js.map'),
            {
                overwrite: true,
                errorOnExist: false,
            }
        )
        console.log('SSM Document Language Service artifacts copied successfully.')
    } catch (e) {
        console.error('Failed to copy SSM Document Language Service artifacts.', e)
        // Exit with non-zero exit code in order to fail the build if copying of any artifact fails.
        process.exit(1)
    }
})()
