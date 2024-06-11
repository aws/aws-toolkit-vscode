// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import software.amazon.awssdk.services.codewhispererstreaming.model.TransformationDownloadArtifactType

sealed class DownloadFailureReason {
    data class SSL_HANDSHAKE_ERROR(val artifactType: TransformationDownloadArtifactType) : DownloadFailureReason()
    data class PROXY_WILDCARD_ERROR(val artifactType: TransformationDownloadArtifactType) : DownloadFailureReason()
    data class INVALID_ARTIFACT(val artifactType: TransformationDownloadArtifactType) : DownloadFailureReason()
    data class OTHER(val artifactType: TransformationDownloadArtifactType, val errorMessage: String) : DownloadFailureReason()
}
