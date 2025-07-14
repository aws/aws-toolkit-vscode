/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export abstract class SagemakerConstants {
    static readonly PlaceHolderMessage = '[No Sagemaker Spaces Found]'
    static readonly EnableIdentityFilteringSetting = 'aws.sagemaker.studio.spaces.enableIdentityFiltering'
    static readonly SelectedDomainUsersState = 'aws.sagemaker.selectedDomainUsers'
    static readonly FilterPlaceholderKey = 'aws.filterSagemakerSpacesPlaceholder'
    static readonly FilterPlaceholderMessage = 'Filter spaces by user profile or domain (unselect to hide)'
    static readonly NoSpaceToFilter = 'No spaces to filter'

    static readonly IamUserArnRegex = /^arn:aws[a-z\-]*:iam::\d{12}:user\/?([a-zA-Z_0-9+=,.@\-_]+)$/
    static readonly IamSessionArnRegex =
        /^arn:aws[a-z\-]*:sts::\d{12}:assumed-role\/?[a-zA-Z_0-9+=,.@\-_]+\/([a-zA-Z_0-9+=,.@\-_]+)$/
    static readonly IdentityCenterArnRegex =
        /^arn:aws[a-z\-]*:sts::\d{12}:assumed-role\/?AWSReservedSSO[a-zA-Z_0-9+=,.@\-_]+\/([a-zA-Z_0-9+=,.@\-_]+)$/
    static readonly SpecialCharacterRegex = /[+=,.@\-_]/g
}
