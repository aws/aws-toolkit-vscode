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
    static readonly InvalidAwsCredentials = 'AWS Role Credentials are invalid. Update AWS credentials and try again.'
}

export type PolicyChecksErrorCode = 'FileReadError'

export type PolicyChecksDocumentType = 'Terraform Plan' | 'CloudFormation' | 'JSON Policy Language'

export type ValidatePolicyFindingType = 'ERROR' | 'SECURITY_WARNING' | 'SUGGESTION' | 'WARNING'
