// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.constants

import com.intellij.ui.JBColor
import com.intellij.util.ui.JBFont
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil
import java.awt.Color
import java.awt.Font
import java.awt.GridBagConstraints
import java.awt.Insets
import javax.swing.BorderFactory

const val FEATURE_NAME = "Amazon Q Transform"

class CodeModernizerUIConstants {

    object HEADER {
        const val PADDING_TOP = 7
        const val PADDING_RIGHT = 14
        const val PADDING_BOTTOM = 7
        const val PADDING_LEFT = 14
        const val FONT_SIZE = 14.0f
    }

    object SCROLL_PANEL {
        const val PADDING_TOP = 7
        const val PADDING_RIGHT = 14
        const val PADDING_BOTTOM = 7
        const val PADDING_LEFT = 14
    }

    object PLAN_CONSTRAINTS {
        const val PLAN_PADDING_TOP = 50
        const val PLAN_PADDING_LEFT = 50
        const val PLAN_PADDING_BOTTOM = 50
        const val PLAN_PADDING_RIGHT = 50

        const val TITLE_FONT_SIZE = 24f
        const val SUBTITLE_FONT_SIZE = 18f
        const val STEP_NAME_FONT_SIZE = 16f
        const val STEP_INFO_FONT_SIZE = 14f
        const val TABLE_NAME_FONT_SIZE = 14f
        const val STEP_DESCRIPTION_FONT_SIZE = 14 // needs to be an integer

        const val NAME_PADDING_TOP = 10
        const val NAME_PADDING_LEFT = 10
        const val NAME_PADDING_BOTTOM = 10
        const val NAME_PADDING_RIGHT = 10

        const val DESCRIPTION_PADDING_TOP = 0
        const val DESCRIPTION_PADDING_LEFT = 10
        const val DESCRIPTION_PADDING_BOTTOM = 25
        const val DESCRIPTION_PADDING_RIGHT = 10

        const val TABLE_PADDING_TOP = 10
        const val TABLE_PADDING_LEFT = 10
        const val TABLE_PADDING_RIGHT = 10

        const val TABLE_NAME_PADDING_TOP = 0
        const val TABLE_NAME_PADDING_LEFT = 10
        const val TABLE_NAME_PADDING_BOTTOM = 0
        const val TABLE_NAME_PADDING_RIGHT = 0

        const val TABLE_ROW_HEIGHT = 25
    }

    object FONT_CONSTRAINTS {
        const val PLAIN = 0
        const val BOLD = 1
        const val ITALIC = 2
    }

    companion object {
        const val EMPTY_SPACE_STRING: String = ""
        val transformationPlanPlaneConstraint = GridBagConstraints().apply {
            gridx = 0
            weightx = 1.0
            weighty = 0.0
            fill = GridBagConstraints.HORIZONTAL
            anchor = GridBagConstraints.NORTH
        }

        val transformationPlanAppendixConstraint = GridBagConstraints().apply {
            gridx = 0
            gridy = GridBagConstraints.RELATIVE
            fill = GridBagConstraints.HORIZONTAL
            anchor = GridBagConstraints.NORTHWEST
            weightx = 1.0
            insets = Insets(5, 5, 5, 5)
        }

        val DESCRIPTION_FONT = JBFont.create(Font("Arial", Font.PLAIN, PLAN_CONSTRAINTS.STEP_DESCRIPTION_FONT_SIZE))

        val PLAN_BORDER = BorderFactory.createEmptyBorder(
            PLAN_CONSTRAINTS.PLAN_PADDING_TOP,
            PLAN_CONSTRAINTS.PLAN_PADDING_LEFT,
            PLAN_CONSTRAINTS.PLAN_PADDING_BOTTOM,
            PLAN_CONSTRAINTS.PLAN_PADDING_RIGHT
        )

        val NAME_BORDER = BorderFactory.createEmptyBorder(
            PLAN_CONSTRAINTS.NAME_PADDING_TOP,
            PLAN_CONSTRAINTS.NAME_PADDING_LEFT,
            PLAN_CONSTRAINTS.NAME_PADDING_BOTTOM,
            PLAN_CONSTRAINTS.NAME_PADDING_RIGHT
        )

        val DESCRIPTION_BORDER = BorderFactory.createEmptyBorder(
            PLAN_CONSTRAINTS.DESCRIPTION_PADDING_TOP,
            PLAN_CONSTRAINTS.DESCRIPTION_PADDING_LEFT,
            PLAN_CONSTRAINTS.DESCRIPTION_PADDING_BOTTOM,
            PLAN_CONSTRAINTS.DESCRIPTION_PADDING_RIGHT
        )

        val TABLE_NAME_BORDER = BorderFactory.createEmptyBorder(
            PLAN_CONSTRAINTS.TABLE_NAME_PADDING_TOP,
            PLAN_CONSTRAINTS.TABLE_NAME_PADDING_LEFT,
            PLAN_CONSTRAINTS.TABLE_NAME_PADDING_BOTTOM,
            PLAN_CONSTRAINTS.TABLE_NAME_PADDING_RIGHT
        )

        val TRANSFORMATION_PLAN_PANEL_BORDER = BorderFactory.createCompoundBorder(
            BorderFactory.createEmptyBorder(10, 10, 10, 10),
            BorderFactory.createLineBorder(CodeWhispererColorUtil.POPUP_BUTTON_BORDER, 1, true)

        )
        val APPENDIX_BORDER = BorderFactory.createEmptyBorder(10, 10, 10, 10)
        val STEPS_INTRO_BORDER = BorderFactory.createEmptyBorder(10, 10, 30, 10)
        val STEPS_INTRO_TITLE_BORDER = BorderFactory.createEmptyBorder(0, 0, 5, 0)
        val TRANSFORMATION_STEP_PANEL_COMPOUND_BORDER = BorderFactory.createCompoundBorder(
            BorderFactory.createCompoundBorder(
                BorderFactory.createEmptyBorder(0, 20, 20, 20),
                BorderFactory.createLineBorder(Color.GRAY, 1, true)
            ),
            BorderFactory.createEmptyBorder(5, 5, 5, 5)
        )
        val TRANSFORMATION_STEPS_INFO_BORDER = BorderFactory.createCompoundBorder(
            BorderFactory.createCompoundBorder(
                BorderFactory.createEmptyBorder(0, 10, 0, 0),
                BorderFactory.createLineBorder(Color.GRAY, 1, true)
            ),
            BorderFactory.createEmptyBorder(10, 10, 10, 10)
        )
        val TRANSFORMATION_STEPS_QCT_INFO_BORDER = BorderFactory.createCompoundBorder(
            BorderFactory.createCompoundBorder(
                BorderFactory.createEmptyBorder(0, 0, 0, 10),
                BorderFactory.createLineBorder(Color.GRAY, 1, true)
            ),
            BorderFactory.createEmptyBorder(10, 10, 10, 10)
        )
        val TRANSFORMATION_PLAN_INFO_BORDER = BorderFactory.createEmptyBorder(10, 10, 10, 10)
        val FILLER_CONSTRAINT = GridBagConstraints().apply {
            gridy = 1
            weighty = 1.0
        }

        fun getGreenThemeFontColor(): Color = if (JBColor.isBright()) JBColor.GREEN.darker() else JBColor.GREEN
        fun getRedThemeFontColor(): Color = JBColor.RED
        fun getStepIcon() = if (JBColor.isBright()) AwsIcons.CodeTransform.TIMELINE_STEP_LIGHT else AwsIcons.CodeTransform.TIMELINE_STEP_DARK
    }
}
