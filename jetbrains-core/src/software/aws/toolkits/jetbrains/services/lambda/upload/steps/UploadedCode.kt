// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload.steps

sealed class UploadedCode
data class UploadedS3Code(val bucket: String, val key: String, val version: String?) : UploadedCode()
data class UploadedEcrCode(val imageUri: String) : UploadedCode()
