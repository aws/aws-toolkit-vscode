// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

sealed class UploadFailureReason {
    data class HTTP_ERROR(val statusCode: Int) : UploadFailureReason()
    object PRESIGNED_URL_EXPIRED : UploadFailureReason()
    object CONNECTION_REFUSED : UploadFailureReason()
    data class OTHER(val errorMessage: String) : UploadFailureReason()
}
