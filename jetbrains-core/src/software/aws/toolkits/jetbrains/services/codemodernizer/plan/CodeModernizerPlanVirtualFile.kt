// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.plan

import com.intellij.testFramework.LightVirtualFile
import software.aws.toolkits.resources.message

class CodeModernizerPlanVirtualFile : LightVirtualFile("Transformation Plan") {
    override fun getPresentableName(): String = message("codemodernizer.migration_plan.header.description")

    override fun getPath(): String = "transformationPlan"

    override fun isWritable(): Boolean = false

    // This along with hashCode() is to make sure only one editor for this is opened at a time
    override fun equals(other: Any?) = other is CodeModernizerPlanVirtualFile && this.hashCode() == other.hashCode()

    override fun hashCode(): Int = presentableName.hashCode()
}
