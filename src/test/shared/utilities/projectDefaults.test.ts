/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as path from 'path'
import {
    AllDafaults,
    makeProjectDefaultsManager,
    ProjectDefaultsManager,
    SamDeployDefaults,
} from '../../../shared/utilities/projectDefaults'

import { readFile, writeFile } from '../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

describe.only('ProjectDefaultsManager', () => {
    let samProjectDir: string
    let samTemplatePath: string
    let expectedSamDeployDefaults: SamDeployDefaults

    before(async () => {
        samProjectDir = await makeTemporaryToolkitFolder()
        samTemplatePath = path.join(samProjectDir, 'template.yaml')
        await writeFile(samTemplatePath, samTemplateText)
        expectedSamDeployDefaults = {
            region: 'us-west-2',
            s3BucketName: 'ma-bucket',
            // samTemplatePath,
            stackName: 'ma-stack'
        }
    })

    it('should have proper initial defaults', () => {
        const defaultsMgr: ProjectDefaultsManager = makeProjectDefaultsManager({samTemplatePath})
        const allDefaults = defaultsMgr.getAllDefaults()
        const expectedVal: AllDafaults = {
            samDeploy: {}
        }
        assert.deepStrictEqual(
            allDefaults,
            expectedVal,
        )
    })

    it('should properly get, set and persist to file', async () => {
        const defaultsMgr: ProjectDefaultsManager = makeProjectDefaultsManager({samTemplatePath})

        await defaultsMgr.setSamDeployDefaults(expectedSamDeployDefaults)
        const actualSamDeplyDefaults = defaultsMgr.getSamDeployDefaults()

        assert.deepStrictEqual(
            expectedSamDeployDefaults,
            actualSamDeplyDefaults,
            `getSamDeployDefaults: ${JSON.stringify({expectedSamDeployDefaults, actualSamDeplyDefaults})}`
        )
        const expectedDataFromFile = {
            samDeploy: {
                [samTemplatePath]: expectedSamDeployDefaults
            }
        }
        const actualDataFromFile = await readFile(defaultsMgr.filePath)
        assert.deepStrictEqual(
            expectedSamDeployDefaults,
            actualSamDeplyDefaults,
            `readFile: ${JSON.stringify({expectedDataFromFile, actualDataFromFile})}`
        )
    })

    it('should load previously saved values', async () => {
        const defaultsMgr: ProjectDefaultsManager = makeProjectDefaultsManager({samTemplatePath})
        const expectedDataFromFile = {
            samDeploy: {
                [samTemplatePath]: expectedSamDeployDefaults
            }
        }
        const actualDataFromFile = defaultsMgr.getAllDefaults()
        assert.deepStrictEqual(
            expectedDataFromFile,
            actualDataFromFile,
            `readFile: ${JSON.stringify({expectedDataFromFile, actualDataFromFile})}`
        )
    })

    it('should merge previous values with newly added', async () => {
        const defaultsMgr: ProjectDefaultsManager = makeProjectDefaultsManager({samTemplatePath})
        const newDefaultsToMerge: SamDeployDefaults = {
            s3BucketName: 'newBucketName'
        }
        const expectedResult: SamDeployDefaults = {
            ...defaultsMgr.getSamDeployDefaults(),
            ...newDefaultsToMerge,
        }
        await defaultsMgr.setSamDeployDefaults(newDefaultsToMerge)
        const actualResult = defaultsMgr.getSamDeployDefaults()
        assert.deepStrictEqual(
            expectedResult,
            actualResult,
            JSON.stringify({expectedResult, actualResult})
        )

        const actualDataFromFile = JSON.parse(String(await readFile(defaultsMgr.filePath)))
        const expectedDataFromFile = defaultsMgr.getAllDefaults()
        assert.deepStrictEqual(
            expectedDataFromFile,
            actualDataFromFile,
            `readFile: ${JSON.stringify({expectedDataFromFile, actualDataFromFile})}`
        )
    })
})

const samTemplateText = `# Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: >
 python-debugging2.1_01

 Sample SAM Template for python-debugging2.1_01

Globals:
 Function:
   Timeout: 3

Resources:
 HelloWorldFunction:
   Type: AWS::Serverless::Function
   Properties:
     CodeUri: hello_world/
     Handler: app.lambda_handler
     Runtime: python2.7
     Events:
       HelloWorld:
         Type: Api
         Properties:
           Path: /hello
           Method: get

Outputs:
HelloWorldApi:
   Description: "API Gateway endpoint URL for Prod stage for Hello World function"
   Value: !Sub "https://\${ServerlessRestApi}.execute-api.\${AWS::Region}.amazonaws.com/Prod/hello/"
 HelloWorldFunction:
   Description: "Hello World Lambda Function ARN"
   Value: !GetAtt HelloWorldFunction.Arn
 HelloWorldFunctionIamRole:
   Description: "Implicit IAM Role created for Hello World function"
   Value: !GetAtt HelloWorldFunctionRole.Arn
`
