// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import software.amazon.awssdk.services.codewhispererstreaming.model.TransformationDownloadArtifactType

sealed class DownloadFailureReason(open val artifactType: TransformationDownloadArtifactType) {
    data class SSL_HANDSHAKE_ERROR(override val artifactType: TransformationDownloadArtifactType) : DownloadFailureReason(artifactType)
    data class PROXY_WILDCARD_ERROR(override val artifactType: TransformationDownloadArtifactType) : DownloadFailureReason(artifactType)
    data class INVALID_ARTIFACT(override val artifactType: TransformationDownloadArtifactType) : DownloadFailureReason(artifactType)
    data class CREDENTIALS_EXPIRED(override val artifactType: TransformationDownloadArtifactType) : DownloadFailureReason(artifactType)
    data class OTHER(override val artifactType: TransformationDownloadArtifactType, val errorMessage: String) : DownloadFailureReason(artifactType)
}
