// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.webview.theme

import java.awt.Color
import java.awt.Font

/**
 * Data class that encapsulates the theme values we extract from the IDE.
 */
data class AmazonQTheme(
    val darkMode: Boolean,
    val font: Font,

    val defaultText: Color,
    val inactiveText: Color,
    val linkText: Color,

    val background: Color,
    val border: Color,
    val activeTab: Color,

    val checkboxBackground: Color,
    val checkboxForeground: Color,

    val textFieldBackground: Color,
    val textFieldForeground: Color,

    val buttonForeground: Color,
    val buttonBackground: Color,
    val secondaryButtonForeground: Color,
    val secondaryButtonBackground: Color,

    val info: Color,
    val success: Color,
    val warning: Color,
    val error: Color,

    val cardBackground: Color,

    val editorFont: Font,
    val editorBackground: Color,
    val editorForeground: Color,
    val editorVariable: Color,
    val editorOperator: Color,
    val editorFunction: Color,
    val editorComment: Color,
    val editorKeyword: Color,
    val editorString: Color,
    val editorProperty: Color,

)
