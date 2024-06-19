/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFile } from 'fs-extra'
import { EOL } from 'os'
import * as CloudFormation from '../../../shared/cloudformation/cloudformation'

export async function saveTemplate(templatePath: string, runtime: string, ...functionNames: string[]) {
    const functionResources = functionNames
        .map(
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
        )
        .join(EOL)

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
