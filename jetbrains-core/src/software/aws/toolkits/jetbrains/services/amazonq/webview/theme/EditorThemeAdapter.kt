// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.webview.theme

import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.colors.ColorKey
import com.intellij.openapi.editor.colors.EditorColorsListener
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.EditorColorsScheme
import com.intellij.openapi.editor.colors.EditorFontType
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.ui.JBColor
import com.intellij.util.ui.UIUtil
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.callbackFlow
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import java.awt.Color

/**
 * Helper class that returns a Flow of [AmazonQTheme] instances based on the current IDE theme.
 */
class EditorThemeAdapter {
    private val logger = getLogger<EditorThemeAdapter>()

    /**
     * Returns a flow of [AmazonQTheme] instances. The current theme is emitted immediately,
     * and a new theme is emitted whenever the look-and-feel of the IDE changes.
     */
    fun onThemeChange() = callbackFlow {
        // Register a listener for changes to the IDE LaF
        val messageBus = ApplicationManager.getApplication().messageBus
        val connection = messageBus.connect()

        // Listen to LaF changes (the overall IDE theme changes)
        connection.subscribe(
            LafManagerListener.TOPIC,
            LafManagerListener {
                // It's important to not throw exceptions from this listener. Throwing here will prevent the user's theme from being properly applied in the IDE
                try {
                    trySend(getThemeFromIde())
                } catch (e: Exception) {
                    logger.error(e) { "Cannot construct Amazon Q theme from IDE colors" }
                }
            },
        )

        // Also listen to EditorColors changes. This will be triggered if the editor's colors or fonts change.
        connection.subscribe(
            EditorColorsManager.TOPIC,
            EditorColorsListener {
                // It's important to not throw exceptions from this listener. Throwing here will prevent the user's theme from being properly applied in the IDE
                try {
                    trySend(getThemeFromIde())
                } catch (e: Exception) {
                    logger.error(e) { "Cannot construct Amazon Q theme from IDE colors" }
                }
            },
        )

        // Send an initial value for the current theme
        send(getThemeFromIde())
        // Disconnect from the message bus when the flow collection is cancelled
        awaitClose { connection.disconnect() }
    }

    companion object {
        // Returns a theme constructed from the current look-and-feel of the IDE
        fun getThemeFromIde(): AmazonQTheme {
            val currentScheme = EditorColorsManager.getInstance().schemeForCurrentUITheme

            val cardBackground = currentScheme.defaultBackground
            val text = currentScheme.defaultForeground
            val chatBackground = tryFindDifferentColor(
                cardBackground,
                "Panel.background",
                "EditorPane.background",
                "EditorPane.inactiveBackground",
                "Editor.background",
                "Content.background",
                default = 0xF2F2F2,
                darkDefault = 0x3C3F41,
            )

            return AmazonQTheme(
                darkMode = !JBColor.isBright(),
                font = UIUtil.getFont(UIUtil.FontSize.NORMAL, null),

                defaultText = text,
                inactiveText = themeColor("TextField.inactiveForeground", default = 0x8C8C8C, darkDefault = 0x808080),
                linkText = themeColor("link.foreground", "link", "Link.activeForeground", default = 0x589DF6),

                background = chatBackground,
                border = getBorderColor(currentScheme),
                activeTab = themeColor("EditorTabs.underlinedTabBackground", default = 0xFFFFFF, darkDefault = 0x4E5254),

                checkboxBackground = themeColor("CheckBox.background", default = 0xF2F2F2, darkDefault = 0x3C3F41),
                checkboxForeground = themeColor("CheckBox.foreground", default = 0x000000, darkDefault = 0xBBBBBB),

                textFieldBackground = themeColor("TextField.background", default = 0xFFFFFF, darkDefault = 0x45494A),
                textFieldForeground = themeColor("TextField.foreground", default = 0x000000, darkDefault = 0xBBBBBB),

                buttonBackground = themeColor("Button.default.startBackground", default = 0x528CC7, darkDefault = 0x365880),
                buttonForeground = themeColor("Button.default.foreground", default = 0xFFFFFF, darkDefault = 0xBBBBBB),
                secondaryButtonBackground = themeColor("Button.startBackground", default = 0xFFFFFF, darkDefault = 0x4C5052),
                secondaryButtonForeground = themeColor("Button.foreground", default = 0x000000, darkDefault = 0xBBBBBB),

                info = themeColor("ProgressBar.progressColor", default = 0x1E82E6, darkDefault = 0xA0A0A0),
                success = themeColor("ProgressBar.passedColor", default = 0x34B171, darkDefault = 0x008F50),
                warning = themeColor("Component.warningFocusColor", default = 0xE2A53A),
                error = themeColor("ProgressBar.failedColor", default = 0xD64F4F, darkDefault = 0xE74848),

                cardBackground = cardBackground,

                editorFont = currentScheme.getFont(EditorFontType.PLAIN),
                editorBackground = chatBackground,
                editorForeground = text,
                editorVariable = currentScheme.foregroundColor(DefaultLanguageHighlighterColors.LOCAL_VARIABLE),
                editorOperator = currentScheme.foregroundColor(DefaultLanguageHighlighterColors.OPERATION_SIGN),
                editorFunction = currentScheme.foregroundColor(DefaultLanguageHighlighterColors.FUNCTION_DECLARATION),
                editorComment = currentScheme.foregroundColor(DefaultLanguageHighlighterColors.LINE_COMMENT),
                editorKeyword = currentScheme.foregroundColor(DefaultLanguageHighlighterColors.KEYWORD),
                editorString = currentScheme.foregroundColor(DefaultLanguageHighlighterColors.STRING),
                editorProperty = currentScheme.foregroundColor(DefaultLanguageHighlighterColors.INSTANCE_FIELD),
            )
        }

        private fun themeColor(name: String, default: Int, darkDefault: Int = default) = JBColor.namedColor(name, JBColor(default, darkDefault))

        private fun themeColor(name: String, vararg backups: String, default: Int, darkDefault: Int = default): Color {
            var defaultColor = JBColor(default, darkDefault)
            for (i in backups.indices.reversed()) {
                defaultColor = JBColor.namedColor(backups[i], defaultColor)
            }
            return JBColor.namedColor(name, defaultColor)
        }

        private fun getBorderColor(currentScheme: EditorColorsScheme) = currentScheme.getColor(ColorKey.find("INDENT_GUIDE")) ?: themeColor(
            "Borders.color",
            "Component.borderColor",
            "EditorTabs.borderColor",
            default = 0xC4C4C4,
            darkDefault = 0x646464,
        )

        private fun tryFindDifferentColor(color: Color, vararg choices: String, default: Int, darkDefault: Int): Color {
            for (choice in choices) {
                val themeColor = JBColor.namedColor(choice)
                if (themeColor != color) {
                    return themeColor
                }
            }
            // None of them are different so just take the first defined value
            return themeColor(choices.first(), *choices, default = default, darkDefault = darkDefault)
        }

        // Not all values may be set in the current scheme. Use the default foreground color if not specified.
        private fun EditorColorsScheme.foregroundColor(key: TextAttributesKey) = getAttributes(key).foregroundColor ?: defaultForeground
    }
}
