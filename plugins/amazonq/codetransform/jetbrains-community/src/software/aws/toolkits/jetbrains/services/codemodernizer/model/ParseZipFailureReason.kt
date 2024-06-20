// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import software.amazon.awssdk.services.codewhispererstreaming.model.TransformationDownloadArtifactType

data class ParseZipFailureReason(val artifactType: TransformationDownloadArtifactType, val errorMessage: String)
