// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.learn

import com.intellij.openapi.fileTypes.FileType
import icons.AwsIcons

class QFileType : FileType {
    override fun getName() = "Learn Q Inline Suggestions"
    override fun getDescription() = "Learn Q inline suggestions"

    override fun getDefaultExtension() = ""
    override fun getIcon() = AwsIcons.Logos.AWS_Q_GRADIENT_SMALL

    override fun isBinary() = false
}
