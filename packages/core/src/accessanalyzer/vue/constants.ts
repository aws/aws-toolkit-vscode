/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export abstract class IamPolicyChecksConstants {
    static readonly ValidatePolicySuccessWithFindings =
        'Review the findings for your policy document in the problems panel. We recommend that you update your policy document and re-run the policy checks until no findings are generated.'
    static readonly ValidatePolicySuccessNoFindings = 'Policy checks did not generate any findings for your policy.'
    static readonly CustomCheckSuccessWithFindings =
        'Result: FAIL. Review the details for the check failure for your policy document in the problems panel. We recommend that you update your policy document and re-run the policy check until the check returns a PASS result.'
    static readonly CustomCheckSuccessNoFindings = 'Result: PASS.'
    static readonly CheckNoNewAccessFilePathSetting = 'aws.accessAnalyzer.policyChecks.checkNoNewAccessFilePath'
    static readonly CheckAccessNotGrantedFilePathSetting =
        'aws.accessAnalyzer.policyChecks.checkAccessNotGrantedFilePath'
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
    | 'accessanalyzer_selectCheckAccessNotGrantedFilePath'
    | 'accessanalyzer_selectCheckNoNewAccessFilePath'
    | 'accessanalyzer_selectCfnParameterFilePath'
    | 'accessanalyzer_runValidatePolicy'
    | 'accessanalyzer_runCustomPolicyCheck'
