/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const plugins = [
    'aws:applications',
    'aws:cloudWatch',
    'aws:configureDocker',
    'aws:configurePackage',
    'aws:domainJoin',
    'aws:downloadContent',
    'aws:psModule',
    'aws:refreshAssociation',
    'aws:runDockerAction',
    'aws:runDocument',
    'aws:runPowerShellScript',
    'aws:runShellScript',
    'aws:softwareInventory',
    'aws:updateAgent',
    'aws:updateSsmAgent',
]

export const automationActions = [
    'aws:approve',
    'aws:assertAwsResourceProperty',
    'aws:branch',
    'aws:changeInstanceState',
    'aws:copyImage',
    'aws:createImage',
    'aws:createStack',
    'aws:createTags',
    'aws:deleteImage',
    'aws:deleteStack',
    'aws:executeAutomation',
    'aws:executeAwsApi',
    'aws:executeScript',
    'aws:executeStateMachine',
    'aws:invokeLambdaFunction',
    'aws:pause',
    'aws:runCommand',
    'aws:runInstances',
    'aws:sleep',
    'aws:waitForAwsResourceProperty',
]
