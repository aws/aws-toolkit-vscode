// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.ui.ComponentValidator
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.ui.popup.ComponentPopupBuilder
import java.util.function.Consumer
import javax.swing.JEditorPane
import kotlin.reflect.full.staticFunctions

/**
 * A set of functions that attempt to abstract API differences that are incompatible between IDEA versions.
 *
 * This can act as a central place where said logic can be removed as min-version increases
 */
object CompatibilityUtils {

    /**
     * Can be removed when min-version is 19.1 FIX_WHEN_MIN_IS_191
     */
    @JvmStatic
    fun createPopupBuilder(validationInfo: ValidationInfo, configurator: Consumer<JEditorPane>?): ComponentPopupBuilder? =
        ComponentValidator::class.staticFunctions.find { it.name == "createPopupBuilder" }?.call(validationInfo, configurator) as? ComponentPopupBuilder
}