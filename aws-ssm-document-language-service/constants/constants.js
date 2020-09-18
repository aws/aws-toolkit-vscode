'use strict'
/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
Object.defineProperty(exports, '__esModule', { value: true })
exports.plugins = exports.automationAction = exports.supportedDocumentTypes = void 0
/*
    This file contains constants used by the language service logic.
    Constansts include:
        1. Document types supported by the language service (supportedDocumentTypes)
        2. Command document actions (plugins)
        3. Output properties for each automation action (automationActionOutputs)
 */
exports.supportedDocumentTypes = ['automation']
/** Reference: https://docs.aws.amazon.com/systems-manager/latest/userguide/automation-actions.html */
exports.automationAction = {
    // key: automation action
    // value: output properties
    'aws:approve': ['ApprovalStatus', 'ApproverDecisions'],
    'aws:assertAwsResourceProperty': [],
    'aws:branch': [],
    'aws:changeInstanceState': [],
    'aws:copyImage': ['ImageId', 'ImageState'],
    'aws:createImage': ['ImageId', 'ImageState'],
    'aws:createStack': ['StackId', 'StackStatus', 'StackStatusReason'],
    'aws:createTags': [],
    'aws:deleteImage': [],
    'aws:deleteStack': [],
    'aws:executeAutomation': ['Output', 'ExecutionId', 'Status'],
    'aws:executeAwsApi': [],
    'aws:executeScript': [],
    'aws:executeStateMachine': [],
    'aws:invokeLambdaFunction': ['StatusCode', 'FunctionError', 'LogResult', 'Payload'],
    'aws:pause': [],
    'aws:runCommand': ['CommandId', 'Status', ' ResponseCode', 'Output'],
    'aws:runInstances': ['InstanceIds'],
    'aws:sleep': [],
    'aws:waitForAwsResourceProperty': [],
}
/** Reference: https://docs.aws.amazon.com/systems-manager/latest/userguide/ssm-plugins.html */
exports.plugins = [
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
//# sourceMappingURL=constants.js.map
