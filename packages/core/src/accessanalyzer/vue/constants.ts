export abstract class IamPolicyChecksConstants {
    static readonly VALIDATE_POLICY_SUCCESS_FINDINGS_FOUND =
        'Please view the problems panel to review the issues with your policy document. Policy checks should be run until issues are no longer found in your policy document.'
    static readonly VALIDATE_POLICY_SUCCESS_NO_FINDINGS =
        'Policy checks did not discover any problems with your policy.'
    static readonly CUSTOM_CHECK_SUCCESS_FINDINGS_FOUND =
        'Result: FAIL. Please view the problems panel to review the issues with your policy document. Policy checks should be run until issues are no longer found in your policy document.'
    static readonly CUSTOM_CHECK_SUCCESS_NO_FINDINGS =
        'Result: PASS. Policy checks did not discover any problems with your policy.'
    static readonly CUSTOM_CHECK_FILE_PATH_SETTING = 'aws.accessAnalyzer.policyChecks.customChecksFilePath'
    static readonly CLOUDFORMATION_PARAMETER_FILE_PATH_SETTING =
        'aws.accessAnalyzer.policyChecks.cloudFormationParameterFilePath'
    static readonly MISSING_REFERENCE_DOC_ERROR = 'Reference policy document is missing.'
    static readonly INCORRECT_FILE_EXTENSION =
        'The file extension does not match the selected document type. Please select the correct document type, or use the proper file extension.'
    static readonly INVALID_AWS_CREDENTIALS = 'AWS Role Credentials are invalid. Update AWS credentials and try again.'
}

export enum PolicyChecksErrorCode {
    FileReadError = 'FileReadError',
}

export enum PolicyChecksDocumentType {
    TERRAFORM_PLAN = 'Terraform Plan',
    CLOUDFORMATION = 'CloudFormation',
    JSON_POLICY_LANGUAGE = 'JSON Policy Language',
}

export enum ValidatePolicyFindingType {
    ERROR = 'ERROR',
    SECURITY_WARNING = 'SECURITY_WARNING',
    SUGGESTION = 'SUGGESTION',
    WARNING = 'WARNING',
}
