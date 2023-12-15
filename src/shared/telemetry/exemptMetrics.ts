/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TODO: Fix calls to these metrics and remove this file.
 * NOTE: Do NOT add additional metrics here, your PR will be rejected. All new metrics should pass validation.
 *
 * Checks were added to all emitted telemetry metrics to ensure they contain the correct properties.
 * This check does not exist outside test/automated runtimes because the error is not useful
 * for the user and doesn't break telemetry.
 *
 * These are metrics that fail validation and are emitted by code that is covered in test cases.
 * This allowlist exists to fix these incrementally and not have CI fail in the meantime.
 */
const validationExemptMetrics: Set<string> = new Set([
    'amazonq_runCommand',
    'apigateway_copyUrl',
    'aws_loadCredentials',
    'aws_validateCredentials',
    'cloudwatchlogs_download',
    'codeTransform_isDoubleClickedToTriggerInvalidProject',
    'codeTransform_jobIsCancelledByUser',
    'codeTransform_jobStatusChanged',
    'codeTransform_logApiError',
    'codeTransform_logApiLatency',
    'codewhisperer_userDecision',
    'codewhisperer_codeScanIssueHover',
    'codewhisperer_codePercentage',
    'codewhisperer_userModification',
    'codewhisperer_userTriggerDecision',
    'dynamicresource_selectResources',
    'dynamicresource_copyIdentifier',
    'dynamicresource_mutateResource',
    'dynamicresource_getResource',
    'dynamicresource_listResource',
    'ecr_copyRepositoryUri',
    'ecr_copyTagUri',
    'ecr_createRepository',
    'ecr_deleteRepository',
    'ecr_deleteTags',
    'feedback_result',
    'lambda_delete',
    's3_uploadObject',
    'sam_deploy',
    'session_start',
    'ssm_deleteDocument',
    'ssm_openDocument',
    'ssm_publishDocument',
    'ssm_updateDocumentVersion',
    'stepfunctions_previewstatemachine',
    'ui_click',
    'vscode_activeRegions',
    'vscode_executeCommand',
])

export function isValidationExemptMetric(metricName: string) {
    return validationExemptMetrics.has(metricName)
}
