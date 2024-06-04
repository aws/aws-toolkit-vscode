// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

sealed class DownloadFailureReason {
    object SSL_HANDSHAKE_ERROR : DownloadFailureReason()
    object PROXY_WILDCARD_ERROR : DownloadFailureReason()
    data class OTHER(val errorMessage: String) : DownloadFailureReason()
}
