// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import software.amazon.awssdk.services.lambda.model.Runtime
import java.nio.file.Path

sealed class CodeDetails
data class ZipBasedCode(val baseDir: Path, val handler: String, val runtime: Runtime) : CodeDetails()
data class ImageBasedCode(val dockerfile: Path) : CodeDetails()
