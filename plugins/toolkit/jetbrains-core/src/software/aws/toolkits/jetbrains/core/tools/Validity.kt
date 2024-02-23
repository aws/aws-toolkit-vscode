// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import com.intellij.openapi.ui.ValidationInfo
import software.aws.toolkits.core.utils.htmlWrap
import software.aws.toolkits.resources.message
import javax.swing.JComponent

/**
 * Represents if the [Tool] is compatible with the Toolkit
 */
sealed class Validity {

    /**
     * The Tool is installed and compatible
     */
    data class Valid(val version: Version) : Validity()

    /**
     * The tool is not valid for some reason
     */
    sealed class Invalid : Validity()

    /**
     * Represents that the tool was not found
     */
    object NotInstalled : Invalid()

    /**
     * The Tool is not installed on the system, or it is unsuitable to be used due to some issue such as corruption or permissions.
     */
    data class ValidationFailed(val detailedMessage: String) : Invalid()

    /**
     * The Tool is installed, but its version is too low to be compatible with the Toolkit / feature
     */
    data class VersionTooOld(val actualVersion: Version, val minVersion: Version) : Invalid()

    /**
     * The Tool is installed, but its version is too new to be compatible with the Toolkit / feature
     */
    data class VersionTooNew(val actualVersion: Version, val maxVersion: Version) : Invalid()
}

/**
 * @return Convert [Validity] to a human-readable error message if one is applicable
 */
fun Validity.Invalid.toErrorMessage(executableType: ToolType<*>): String = when (this) {
    is Validity.ValidationFailed -> message("executableCommon.missing_executable", executableType.displayName, this.detailedMessage)
    is Validity.NotInstalled -> message("executableCommon.not_installed")
    is Validity.VersionTooNew -> message("executableCommon.version_too_high")
    is Validity.VersionTooOld -> message("executableCommon.version_too_low2", executableType.displayName, this.minVersion)
}

/**
 * @return Convert [Validity] to a human-readable error message for UI validation if one is applicable
 */
fun Validity.toValidationInfo(executableType: ToolType<*>, component: JComponent? = null) = when (this) {
    is Validity.Valid -> null
    is Validity.Invalid -> ValidationInfo(toErrorMessage(executableType).htmlWrap(), component)
}
