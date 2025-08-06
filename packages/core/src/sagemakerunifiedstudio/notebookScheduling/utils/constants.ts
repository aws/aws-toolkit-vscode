/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Page {
    name: string
    metadata:
        | CreateJobPageMetadata
        | ViewJobsPageMetadata
        | JobDetailPageMetadata
        | JobDefinitionDetailPageMetadata
        | EditJobDefinitionPageMetadata
}

export interface CreateJobPageMetadata {}

export interface ViewJobsPageMetadata {
    newJob?: string
    newJobDefinition?: string
    showJobDefinitions?: boolean
}

export interface JobDetailPageMetadata {
    jobId: string
}

export interface JobDefinitionDetailPageMetadata {
    jobDefinitionId: string
}

export interface EditJobDefinitionPageMetadata {
    jobDefinitionId: string
}

export const createJobPage: string = 'createJob'

export const viewJobsPage: string = 'viewJobs'

export const jobDetailPage: string = 'jobDetailPage'

export const jobDefinitionDetailPage: string = 'jobDefinitionDetailPage'

export const editJobDefinitionPage: string = 'editJobDefinitionPage'

export enum SageMakerSearchSortOrder {
    ASCENDING = 'Ascending',
    DESCENDING = 'Descending',
}

export enum SearchSortOrder {
    ASCENDING = 'Ascending',
    DESCENDING = 'Descending',
    NONE = 'None',
}

export enum JobTag {
    IS_SCHEDULING_NOTEBOOK_JOB = 'sagemaker:is-scheduling-notebook-job',
    IS_STUDIO_ARCHIVED = 'sagemaker:is-studio-archived',
    JOB_DEFINITION_ID = 'sagemaker:job-definition-id',
    NAME = 'sagemaker:name',
    NOTEBOOK_NAME = 'sagemaker:notebook-name',
    USER_PROFILE_NAME = 'sagemaker:user-profile-name',
    NOTEBOOK_JOB_ORIGIN = 'sagemaker:notebook-job-origin',
    AmazonDataZoneProject = 'AmazonDataZoneProject',
    ONE_TIME_SCHEDULE = 'sagemaker-studio:one-time',
    SMUS_USER_ID = 'sagemaker-studio:user-id',
}

export enum RuntimeEnvironmentParameterName {
    SM_IMAGE = 'sm_image',
    SM_KERNEL = 'sm_kernel',
    SM_INIT_SCRIPT = 'sm_init_script',
    SM_LCC_INIT_SCRIPT_ARN = 'sm_lcc_init_script_arn',
    S3_INPUT = 's3_input',
    S3_INPUT_ACCOUNT_ID = 's3_input_account_id',
    S3_OUTPUT = 's3_output',
    S3_OUTPUT_ACCOUNT_ID = 's3_output_account_id',
    ROLE_ARN = 'role_arn',
    VPC_SECURITY_GROUP_IDS = 'vpc_security_group_ids',
    VPC_SUBNETS = 'vpc_subnets',
    SM_OUTPUT_KMS_KEY = 'sm_output_kms_key',
    SM_VOLUME_KMS_KEY = 'sm_volume_kms_key',
    MAX_RETRY_ATTEMPTS = 'max_retry_attempts',
    MAX_RUN_TIME_IN_SECONDS = 'max_run_time_in_seconds',
    SM_SKIP_EFS_SIMULATION = 'sm_skip_efs_simulation',
    ENABLE_NETWORK_ISOLATION = 'enable_network_isolation',
}

export enum JobEnvironmentVariableName {
    SM_JOB_DEF_VERSION = 'SM_JOB_DEF_VERSION',
    SM_FIRST_PARTY_IMAGEOWNER = 'SM_FIRST_PARTY_IMAGEOWNER',
    SM_FIRST_PARTY_IMAGE_ARN = 'SM_FIRST_PARTY_IMAGE_ARN',
    SM_KERNEL_NAME = 'SM_KERNEL_NAME',
    SM_SKIP_EFS_SIMULATION = 'SM_SKIP_EFS_SIMULATION',
    SM_EFS_MOUNT_PATH = 'SM_EFS_MOUNT_PATH',
    SM_EFS_MOUNT_UID = 'SM_EFS_MOUNT_UID',
    SM_EFS_MOUNT_GID = 'SM_EFS_MOUNT_GID',
    SM_INPUT_NOTEBOOK_NAME = 'SM_INPUT_NOTEBOOK_NAME',
    SM_OUTPUT_NOTEBOOK_NAME = 'SM_OUTPUT_NOTEBOOK_NAME',
    AWS_DEFAULT_REGION = 'AWS_DEFAULT_REGION',
    SM_ENV_NAME = 'SM_ENV_NAME',
    SM_INIT_SCRIPT = 'SM_INIT_SCRIPT',
    SM_LCC_INIT_SCRIPT = 'SM_LCC_INIT_SCRIPT',
    SM_LCC_INIT_SCRIPT_ARN = 'SM_LCC_INIT_SCRIPT_ARN',
    SM_OUTPUT_FORMATS = 'SM_OUTPUT_FORMATS',
    SM_EXECUTION_INPUT_PATH = 'SM_EXECUTION_INPUT_PATH',
    SM_PACKAGE_INPUT_FOLDER = 'SM_PACKAGE_INPUT_FOLDER',
}
