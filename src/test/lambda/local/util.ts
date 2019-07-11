/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as path from 'path'
import { Uri, WorkspaceFolder } from 'vscode'
import { CloudFormation } from '../../../shared/cloudformation/cloudformation'
import { writeFile } from '../../../shared/filesystem'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

export async function createWorkspaceFolder(prefix: string): Promise<{
    workspacePath: string
    workspaceFolder: WorkspaceFolder
}> {
    const workspacePath = await makeTemporaryToolkitFolder(prefix)

    return {
        workspacePath,
        workspaceFolder: {
            uri: Uri.file(workspacePath),
            name: path.basename(workspacePath),
            index: 0
        }
    }
}

export async function saveTemplate(templatePath: string, runtime: string, ...functionNames: string[]) {
    const functionResources = functionNames.map(
        functionName => `    ${functionName}:
        Type: ${CloudFormation.SERVERLESS_FUNCTION_TYPE}
        Properties:
            CodeUri: hello_world/
            Handler: app.lambdaHandler
            Runtime: ${runtime}
            Environment:
                Variables:
                    PARAM1: VALUE
            Events:
                HelloWorld:
                    Type: Api
                    Properties:
                        Path: /hello
                        Method: get`
    ).join(os.EOL)

    const templateContent = `AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: >
    my-sam-app

    Sample SAM Template for my-sam-app

Globals:
  Function:
    Timeout: 3

Resources:
${functionResources}

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

    await writeFile(templatePath, templateContent, 'utf8')
}
