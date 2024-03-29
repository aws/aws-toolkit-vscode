// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import java.io.File

sealed class ZipCreationResult(open val payload: File) {
    data class Missing1P(override val payload: File) : ZipCreationResult(payload)
    data class Succeeded(override val payload: File) : ZipCreationResult(payload)
}
