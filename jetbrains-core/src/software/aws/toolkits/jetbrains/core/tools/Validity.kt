// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import com.intellij.openapi.ui.ValidationInfo
import software.aws.toolkits.resources.message
import javax.swing.JComponent

/**
 * Represents if the [Tool] is compatible with the Toolkit
 */
sealed class Validity() {
    /**
     * The Tool is not installed on the system, or it is unsuitable to be used due to some issue such as corruption or permissions.
     */
    data class NotInstalled(val detailedMessage: String? = null) : Validity()

    /**
     * The Tool is installed, but its version is too low to be compatible with the Toolkit / feature
     */
    data class VersionTooOld(val minVersion: Version) : Validity()

    /**
     * The Tool is installed, but its version is too new to be compatible with the Toolkit / feature
     */
    data class VersionTooNew(val maxVersion: Version) : Validity()

    /**
     * The Tool is installed and compatible
     */
    data class Valid(val version: Version) : Validity()
}

/**
 * @return Convert [Validity] to a human-readable error message if one is applicable
 */
fun Validity.toErrorMessage(executableType: ToolType<*>): String? = when (this) {
    is Validity.Valid -> null
    is Validity.NotInstalled -> {
        var message = message("executableCommon.missing_executable", executableType.displayName)
        if (this.detailedMessage != null) {
            message += "\n" + this.detailedMessage
        }
        message
    }
    is Validity.VersionTooNew -> message("executableCommon.version_too_high")
    is Validity.VersionTooOld -> message("executableCommon.version_too_low2", executableType.displayName, this.minVersion)
}

/**
 * @return Convert [Validity] to a human-readable error message for UI validation if one is applicable
 */
fun Validity.toValidationInfo(executableType: ToolType<*>, component: JComponent? = null): ValidationInfo? = this.toErrorMessage(executableType)?.let {
    ValidationInfo(it, component)
}
