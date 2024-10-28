/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { fs } from '../../../shared'

export async function generateSamconfigFileCustomData(dir: vscode.Uri, body: string) {
    const uri = vscode.Uri.joinPath(dir, 'samconfig.toml')
    const data = `
    version = 0.1
    
    ${body}
`
    await fs.writeFile(uri, data)
    return uri
}

export const samconfigCompleteData = `
version = 0.1

[default.build.parameters]
cached = true
parallel = true
use_container = true

[default.global.parameters]
stack_name = "project-1"
region = "us-west-2"

[default.deploy.parameters]
confirm_changeset = false
resolve_s3 = true

[default.sync.parameters]
s3_bucket = "aws-sam-cli-managed-default-samclisourcebucket-lftqponsaxsr"
dependency_layer = false
watch = false
`
export const samconfigCompleteDataWithoutGlobal = `
version = 0.1

[default.build.parameters]
cached = true
parallel = true
use_container = true

[default.deploy.parameters]
confirm_changeset = false
resolve_s3 = true

[default.sync.parameters]
s3_bucket = "aws-sam-cli-managed-default-samclisourcebucket-lftqponsaxsr"
dependency_layer = false
watch = false
`
export const samconfigInvalidData = `
version = 0.1

[default.global.parameters]
stack_name = project-1
region = us-west-2
`
export function generateSamconfigData(data: {
    sync?: Array<{ key: string; value: string }>
    build?: Array<{ key: string; value: string }>
    deploy?: Array<{ key: string; value: string }>
    global?: Array<{ key: string; value: string }>
}): string {
    const result: string[] = ['version = 0.1']

    for (const [operation, parameters] of Object.entries(data)) {
        if (parameters && parameters.length > 0) {
            result.push('', `[default.${operation}.parameters]`)
            parameters.forEach(({ key, value }) => {
                value && result.push(`${key} = "${value}"`)
            })
        }
    }

    return result.join('\n')
}

export const validTemplateData = `
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Parameters:
  SourceBucketName:
    Type: String
    Default: project-1-source-bucket
  DestinationBucketName:
    Type: String
    Default: project-1-destination-bucket

Resources:
  SourceBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Ref SourceBucketName
  ResizerFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: src/
      Handler: app.lambda_handler
      Runtime: python3.12
      MemorySize: 2048
      Environment:
        Variables:
          DESTINATION_BUCKETNAME: !Ref DestinationBucketName
      Events:
        FileUpload:
          Type: S3
          Properties:
            Bucket: !Ref SourceBucket
            Events: s3:ObjectCreated:*
`
