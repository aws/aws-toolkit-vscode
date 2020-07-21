/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
export declare const supportedDocumentTypes: string[]
/** Reference: https://docs.aws.amazon.com/systems-manager/latest/userguide/automation-actions.html */
export declare const automationAction: {
    'aws:approve': string[]
    'aws:assertAwsResourceProperty': any[]
    'aws:branch': any[]
    'aws:changeInstanceState': any[]
    'aws:copyImage': string[]
    'aws:createImage': string[]
    'aws:createStack': string[]
    'aws:createTags': any[]
    'aws:deleteImage': any[]
    'aws:deleteStack': any[]
    'aws:executeAutomation': string[]
    'aws:executeAwsApi': any[]
    'aws:executeScript': any[]
    'aws:executeStateMachine': any[]
    'aws:invokeLambdaFunction': string[]
    'aws:pause': any[]
    'aws:runCommand': string[]
    'aws:runInstances': string[]
    'aws:sleep': any[]
    'aws:waitForAwsResourceProperty': any[]
}
/** Reference: https://docs.aws.amazon.com/systems-manager/latest/userguide/ssm-plugins.html */
export declare const plugins: string[]
