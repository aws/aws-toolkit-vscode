// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:JvmName("UiUtils")

package software.aws.toolkits.jetbrains.utils.ui

import com.intellij.lang.Language
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.ui.GraphicsConfig
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.ClickListener
import com.intellij.ui.EditorTextField
import com.intellij.ui.JBColor
import com.intellij.ui.JreHiDpiUtil
import com.intellij.ui.paint.LinePainter2D
import com.intellij.util.ui.GraphicsUtil
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import software.aws.toolkits.jetbrains.utils.formatText
import java.awt.AlphaComposite
import java.awt.Color
import java.awt.Graphics2D
import java.awt.event.MouseEvent
import java.awt.geom.RoundRectangle2D
import javax.swing.AbstractButton
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JTextField
import javax.swing.ListModel

fun JTextField?.blankAsNull(): String? = if (this?.text?.isNotBlank() == true) {
    text
} else {
    null
}

@Suppress("UNCHECKED_CAST")
fun <T> JComboBox<T>?.selected(): T? = this?.selectedItem as? T

fun EditorTextField.formatAndSet(content: String, language: Language) {
    CommandProcessor.getInstance().runUndoTransparentAction {
        val formatted = formatText(this.project, language, content)
        runWriteAction {
            document.setText(formatted)
        }
    }
}

/**
 * Allows triggering [button] selection based on clicking on receiver component
 */
@JvmOverloads
fun JComponent.addQuickSelect(button: AbstractButton, postAction: Runnable? = null) {
    object : ClickListener() {
        override fun onClick(event: MouseEvent, clickCount: Int): Boolean {
            if (button.isSelected) {
                return false
            }
            button.isSelected = true
            postAction?.run()
            return true
        }
    }.installOn(this)
}

fun <T> ListModel<T>.find(predicate: (T) -> Boolean): T? {
    for (i in 0 until size) {
        val element = getElementAt(i)?.takeIf(predicate)
        if (element != null) {
            return element
        }
    }
    return null
}

// Error messages do not work on a disabled component. May be a JetBrains bug?
fun JComponent.validationInfo(message: String) = when {
    isEnabled -> ValidationInfo(message, this)
    else -> ValidationInfo(message)
}

val BETTER_GREEN = JBColor(Color(104, 197, 116), JBColor.GREEN.darker())

/**
 * Fork of JetBrain's intellij-community UIUtils.drawSearchMatch allowing us to highlight multiple a multi-line
 * text field (startY was added and used instead of constants). Also auto-converted to Kotlin by Intellij
 */
fun drawSearchMatch(
    g: Graphics2D,
    startX: Float,
    endX: Float,
    startY: Float,
    height: Int
) {
    val color1 = JBColor.namedColor("SearchMatch.startBackground", JBColor.namedColor("SearchMatch.startColor", 0xffeaa2))
    val color2 = JBColor.namedColor("SearchMatch.endBackground", JBColor.namedColor("SearchMatch.endColor", 0xffd042))
    drawSearchMatch(g, startX, endX, startY, height, color1, color2)
}

fun drawSearchMatch(graphics2D: Graphics2D, startXf: Float, endXf: Float, startY: Float, height: Int, gradientStart: Color, gradientEnd: Color) {
    val config = GraphicsConfig(graphics2D)
    var alpha = JBUI.getInt("SearchMatch.transparency", 70) / 100f
    alpha = if (alpha < 0 || alpha > 1) 0.7f else alpha
    graphics2D.composite = AlphaComposite.getInstance(AlphaComposite.SRC_OVER, alpha)
    graphics2D.paint = UIUtil.getGradientPaint(startXf, startY + 2f, gradientStart, startXf, startY - height - 5.toFloat(), gradientEnd)
    if (JreHiDpiUtil.isJreHiDPI(graphics2D)) {
        val c = GraphicsUtil.setupRoundedBorderAntialiasing(graphics2D)
        graphics2D.fill(RoundRectangle2D.Float(startXf, startY + 2, endXf - startXf, (height - 4).toFloat(), 5f, 5f))
        c.restore()
        config.restore()
        return
    }
    val startX = startXf.toInt()
    val endX = endXf.toInt()
    graphics2D.fillRect(startX, startY.toInt() + 3, endX - startX, height - 5)
    val drawRound = endXf - startXf > 4
    if (drawRound) {
        LinePainter2D.paint(graphics2D, startX - 1.toDouble(), startY + 4.0, startX - 1.toDouble(), startY + height - 4.toDouble())
        LinePainter2D.paint(graphics2D, endX.toDouble(), startY + 4.0, endX.toDouble(), startY + height - 4.toDouble())
        graphics2D.color = Color(100, 100, 100, 50)
        LinePainter2D.paint(graphics2D, startX - 1.toDouble(), startY + 4.0, startX - 1.toDouble(), startY + height - 4.toDouble())
        LinePainter2D.paint(graphics2D, endX.toDouble(), startY + 4.0, endX.toDouble(), startY + height - 4.toDouble())
        LinePainter2D.paint(graphics2D, startX.toDouble(), startY + 3.0, endX - 1.toDouble(), startY + 3.0)
        LinePainter2D.paint(graphics2D, startX.toDouble(), startY + height - 3.toDouble(), endX - 1.toDouble(), startY + height - 3.toDouble())
    }
    config.restore()
}
