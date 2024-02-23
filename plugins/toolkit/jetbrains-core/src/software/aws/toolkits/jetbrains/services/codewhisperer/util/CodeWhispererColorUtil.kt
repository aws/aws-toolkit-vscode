// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.ui.Gray
import com.intellij.ui.JBColor
import com.intellij.util.ui.UIUtil
import java.awt.Color

object CodeWhispererColorUtil {
    val POPUP_HOVER = JBColor(Gray.xC0, Gray.xFF)
    val POPUP_BUTTON_BORDER = JBColor(Gray.x32, Gray.x64)
    val POPUP_PANEL_SEPARATOR = JBColor.border()
    val POPUP_DIM_HEX = JBColor.GRAY.getHexString()
    val POPUP_REF_NOTICE_HEX = JBColor(0x2097F6, 0x2097F6).getHexString()
    val POPUP_REF_INFO = Gray.x8C
    val TOOLWINDOW_BACKGROUND = EditorColorsManager.getInstance().globalScheme.defaultBackground
    val TOOLWINDOW_CODE = JBColor(0x629623, 0x629623)
    val EDITOR_CODE_REFERENCE_HOVER = JBColor(0x4B4D4D, 0x4B4D4D)
    val INACTIVE_TEXT_COLOR = UIUtil.getInactiveTextColor().getHexString()
    val TRY_EXAMPLE_EVEN_ROW_COLOR = JBColor(0xCACACA, 0x252525)

    fun Color.getHexString() = String.format("#%02x%02x%02x", this.red, this.green, this.blue)
}
