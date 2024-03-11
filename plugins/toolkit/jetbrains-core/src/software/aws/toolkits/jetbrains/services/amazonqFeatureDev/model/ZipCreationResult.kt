// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.model

import java.io.File

data class ZipCreationResult(val payload: File, val checksum: String, val contentLength: Long)
