/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export abstract class IamPolicyChecksConstants {
    static readonly ValidatePolicySuccessWithFindings =
        'Please view the problems panel to review the issues with your policy document. Policy checks should be run until issues are no longer found in your policy document.'
    static readonly ValidatePolicySuccessNoFindings = 'Policy checks did not discover any problems with your policy.'
    static readonly CustomCheckSuccessWithFindings =
        'Result: FAIL. Please view the problems panel to review the issues with your policy document. Policy checks should be run until issues are no longer found in your policy document.'
    static readonly CustomCheckSuccessNoFindings =
        'Result: PASS. Policy checks did not discover any problems with your policy.'
    static readonly CustomCheckFilePathSetting = 'aws.accessAnalyzer.policyChecks.customChecksFilePath'
    static readonly CfnParameterFilePathSetting = 'aws.accessAnalyzer.policyChecks.cloudFormationParameterFilePath'
    static readonly MissingReferenceDocError = 'Reference document is missing.'
    static readonly IncorrectFileExtension =
        'The file extension does not match the selected document type. Please select the correct document type, or use the proper file extension.'
    static readonly InvalidAwsCredentials =
        'AWS Role Credentials are invalid or expired. Update AWS credentials and try again.'
}

export type PolicyChecksErrorCode = 'FileReadError' | 'ValidatePolicyError' | 'CustomChecksError'

export type PolicyChecksDocumentType = 'Terraform Plan' | 'CloudFormation' | 'JSON Policy Language'

export type PolicyChecksCheckType = 'CheckNoNewAccess' | 'CheckAccessNotGranted'

export type PolicyChecksPolicyType = 'Identity' | 'Resource'

export type ValidatePolicyFindingType = 'ERROR' | 'SECURITY_WARNING' | 'SUGGESTION' | 'WARNING'

export type PolicyChecksResult = 'Success' | 'Warning' | 'Error'

export type PolicyChecksUiClick =
    | 'accessanalyzer_selectDocumentType'
    | 'accessanalyzer_selectInputPolicyType'
    | 'accessanalyzer_selectReferencePolicyType'
    | 'accessanalyzer_selectCustomCheckType'
    | 'accessanalyzer_selectCustomChecksFilePath'
    | 'accessanalyzer_selectCfnParameterFilePath'
    | 'accessanalyzer_runValidatePolicy'
    | 'accessanalyzer_runCustomPolicyCheck'
